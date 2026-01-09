import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ListingData {
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number | null;
  propertyType: string;
  hoa: number;
  propertyTax: number | null;
  // Additional fields for better extraction
  lotSqft?: number | null;
  status?: string;
  keyFeatures?: string[];
  missingFields?: string[];
  confidence?: Record<string, number>;
  extractionNotes?: string;
}

interface IngestResult {
  raw_text: string;
  source: 'direct_fetch' | 'google_search_fallback';
  notes: string;
  needsFallback?: boolean;
  searchProviderUsed?: 'google' | 'none';
  searchQueryUsed?: string;
  numSearchResultsUsed?: number;
}

interface GoogleSearchResult {
  title: string;
  snippet: string;
  link: string;
}

/**
 * Google Custom Search API helper
 * Returns top 5 search results with title, snippet, and link
 */
async function googleSearch(query: string): Promise<GoogleSearchResult[]> {
  const key = process.env.VITE_GOOGLE_SEARCH_API_KEY;
  const cx = process.env.VITE_GOOGLE_SEARCH_ENGINE_ID;

  if (!key || !cx) {
    throw new Error('Missing VITE_GOOGLE_SEARCH_API_KEY or VITE_GOOGLE_SEARCH_ENGINE_ID in server environment variables.');
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PropertySearch/1.0)'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Google Search API error (${response.status}):`, errorText.substring(0, 200));
      throw new Error(`Google Search API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    // Return top 5 results
    return data.items.slice(0, 5).map((item: any) => ({
      title: item.title || '',
      snippet: item.snippet || '',
      link: item.link || ''
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Google Search API request timed out after 10 seconds');
    }
    throw error;
  }
}

/**
 * Convert HTML to plain readable text
 * Removes scripts, styles, and keeps only visible text
 */
function htmlToPlainText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags but keep text content
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Step A: Best-effort raw text ingestion
 * Tries direct fetch first, falls back to search snippets if blocked
 */
async function ingestListingText(url: string): Promise<IngestResult> {
  // Validate URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('URL must start with http:// or https://');
  }

  // Try direct fetch first
  try {
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
      redirect: 'follow',
    });

    if (fetchResponse.ok) {
      const htmlContent = await fetchResponse.text();
      const plainText = htmlToPlainText(htmlContent);
      
      // Truncate to reasonable size (25k chars to control token cost)
      const truncatedText = plainText.length > 25000 
        ? plainText.substring(0, 25000) + '... [truncated]'
        : plainText;

      return {
        raw_text: truncatedText,
        source: 'direct_fetch',
        notes: `Successfully fetched ${htmlContent.length} chars, converted to ${truncatedText.length} chars of plain text`,
        searchProviderUsed: 'none',
        searchQueryUsed: undefined,
        numSearchResultsUsed: undefined
      };
    } else if (fetchResponse.status === 403 || fetchResponse.status === 401 || fetchResponse.status === 429) {
      // Blocked - will try OpenAI web search fallback
      throw new Error(`Blocked: ${fetchResponse.status} ${fetchResponse.statusText}`);
    } else {
      throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
    }
  } catch (fetchError) {
    // Mark that we need fallback - will be handled by OpenAI web search
    console.log('Direct fetch failed, will use OpenAI web search fallback:', fetchError);
    throw fetchError;
  }
}

/**
 * Extract address from URL for search query
 */
function extractAddressFromUrl(url: string): string | null {
  try {
    // Try to extract address from common real estate URL patterns
    // Zillow: /homedetails/442-W-Randys-Ct-Farmington-UT-84025/458391817_zpid/
    const zillowMatch = url.match(/homedetails\/([^\/]+)\//);
    if (zillowMatch) {
      return decodeURIComponent(zillowMatch[1].replace(/-/g, ' '));
    }
    
    // Redfin: /home/...
    const redfinMatch = url.match(/redfin\.com\/[^\/]+\/([^\/]+)/);
    if (redfinMatch) {
      return decodeURIComponent(redfinMatch[1].replace(/-/g, ' '));
    }
    
    // Generic: try to find address-like patterns in URL
    const addressPattern = /([A-Z0-9\s]+-[A-Z0-9\s]+-[A-Z]{2}-[0-9]{5})/i;
    const match = url.match(addressPattern);
    if (match) {
      return match[1].replace(/-/g, ' ');
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if listing data has critical missing fields
 */
function hasCriticalMissingFields(listing: ListingData): boolean {
  return !listing.price || !listing.sqft || !listing.beds || !listing.baths;
}

/**
 * Get listing data using Google Search + OpenAI extraction
 * This is used as fallback when direct fetch is blocked or critical fields are missing
 */
async function getListingDataFromGoogleSearch(url?: string, mlsNumber?: string, address?: string): Promise<{ listing: ListingData; ingestion: IngestResult }> {
  // Check both environment variable names for backward compatibility
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in Vercel environment variables.');
  }

  // Build search query from MLS, address, or URL
  // Priority: address (most specific) > mlsNumber > addressFromUrl > url
  // Add property listing terms to improve search results
  let searchQuery: string;
  let fallbackQueries: string[] = [];
  
  if (address) {
    // Primary query with property listing terms
    searchQuery = `"${address}" property listing for sale`;
    // Fallback queries if primary fails
    fallbackQueries = [
      `"${address}" real estate`,
      `"${address}" zillow`,
      `"${address}" redfin`,
      address // Just the address without quotes
    ];
  } else if (mlsNumber) {
    searchQuery = `"${mlsNumber}" MLS property listing`;
    fallbackQueries = [
      `MLS ${mlsNumber} real estate`,
      `MLS ${mlsNumber} property`,
      mlsNumber
    ];
  } else if (url) {
    // Extract address from URL for better search query
    const addressFromUrl = extractAddressFromUrl(url);
    if (addressFromUrl) {
      searchQuery = `"${addressFromUrl}" property listing`;
      fallbackQueries = [
        `"${addressFromUrl}" real estate`,
        `"${addressFromUrl}" zillow`,
        addressFromUrl
      ];
    } else {
      searchQuery = `property listing ${url}`;
      fallbackQueries = [url];
    }
  } else {
    throw new Error('No search query available: need URL, address, or MLS number');
  }

  // Perform Google Search with fallback strategies
  let searchResults: GoogleSearchResult[] = [];
  let queryUsed = searchQuery;
  
  try {
    searchResults = await googleSearch(searchQuery);
    queryUsed = searchQuery;
  } catch (error) {
    console.log(`Primary search failed, trying fallbacks...`);
  }
  
  // If primary search returns no results, try fallbacks
  if (searchResults.length === 0 && fallbackQueries.length > 0) {
    for (const fallbackQuery of fallbackQueries) {
      try {
        searchResults = await googleSearch(fallbackQuery);
        if (searchResults.length > 0) {
          queryUsed = fallbackQuery;
          console.log(`Fallback query succeeded: ${fallbackQuery}`);
          break;
        }
      } catch (fallbackError) {
        console.log(`Fallback query failed: ${fallbackQuery}`);
        continue;
      }
    }
  }
  
  if (searchResults.length === 0) {
    throw new Error(`No search results found from Google Search. Tried queries: ${[searchQuery, ...fallbackQueries].join(', ')}`);
  }

  // Build raw_text from search results (top 3-5 results)
  const topResults = searchResults.slice(0, 5);
  let rawText = '';
  for (const result of topResults) {
    rawText += `Title: ${result.title}\n`;
    rawText += `Snippet: ${result.snippet}\n`;
    rawText += `Link: ${result.link}\n\n`;
  }

  const instructions = `You are a real estate data extraction assistant. Extract property listing information from the provided search results.

IMPORTANT RULES:
1. Extract ONLY verifiable facts from the search results provided. Never guess or invent values.
2. If a field cannot be determined from the search results, return null (NOT 0 or empty string).
3. Include all fields you could not find in the missingFields array.
4. Set confidence scores (0.0 to 1.0) for each field based on how certain you are.
5. Return a valid JSON object matching the required schema.

Return a JSON object with these fields:
- address: Full street address with city, state, zip (or null)
- price: List price as number, no commas, no $ (or null)
- beds: Number of bedrooms (or null)
- baths: Number of bathrooms, can be decimal like 2.5 (or null)
- sqft: Square footage (or null)
- yearBuilt: Year built (or null)
- propertyType: Property type like "Single Family", "Condo", "Townhouse" (or null)
- hoa: Monthly HOA amount, use 0 only if explicitly stated as $0 (or null)
- propertyTax: Annual property tax (or null)
- lotSqft: Lot size in square feet (or null)
- status: Status like "For Sale", "Sold", "Pending" (or null)
- keyFeatures: Array of up to 8 key features (empty array if none)
- missingFields: Array of field names that were not found in the search results
- confidence: Object mapping each extracted field to a confidence score (0.0 to 1.0)
- extractionNotes: Brief explanation of what was found and any issues

Return ONLY valid JSON, no markdown, no code blocks.`;

  const input = `Extract property listing data from these search results:

${rawText}

${address ? `Target property address: ${address}` : ''}
${mlsNumber ? `Target MLS number: ${mlsNumber}` : ''}
${url ? `Original URL: ${url}` : ''}

Extract property information from the search results above. Use null for any fields you cannot confidently determine from the provided search results. Include all missing fields in the missingFields array.`;

  // JSON Schema for ListingData
  const listingDataSchema = {
    type: 'object',
    properties: {
      address: { type: ['string', 'null'], description: 'Full street address with city, state, zip' },
      price: { type: ['number', 'null'], description: 'List price as number (no commas, no $)' },
      beds: { type: ['integer', 'null'], description: 'Number of bedrooms' },
      baths: { type: ['number', 'null'], description: 'Number of bathrooms (can be decimal like 2.5)' },
      sqft: { type: ['integer', 'null'], description: 'Square footage' },
      yearBuilt: { type: ['integer', 'null'], description: 'Year built' },
      propertyType: { type: ['string', 'null'], description: 'Property type: "Single Family", "Condo", "Townhouse", etc.' },
      hoa: { type: ['number', 'null'], description: 'Monthly HOA amount (use 0 only if explicitly stated as $0)' },
      propertyTax: { type: ['number', 'null'], description: 'Annual property tax' },
      lotSqft: { type: ['integer', 'null'], description: 'Lot size in square feet' },
      status: { type: ['string', 'null'], description: 'Status: "For Sale", "Sold", "Pending", etc.' },
      keyFeatures: { 
        type: 'array', 
        items: { type: 'string' },
        maxItems: 8,
        description: 'Array of up to 8 key features'
      },
      missingFields: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Array of field names that were not found in search results'
      },
      confidence: { 
        type: 'object',
        additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
        description: 'Object mapping each extracted field to a confidence score (0.0 to 1.0)'
      },
      extractionNotes: { type: 'string', description: 'Brief explanation of what was found, sources used, and any issues' }
    },
    required: ['address', 'price', 'beds', 'baths', 'sqft', 'yearBuilt', 'propertyType', 'hoa', 'propertyTax', 'lotSqft', 'status', 'keyFeatures', 'missingFields', 'confidence', 'extractionNotes']
  };

  // Retry logic for rate limits
  let openaiResponse;
  let lastError;
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.pow(2, attempt - 1) * 1000;
      console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Use OpenAI Chat Completions API with structured JSON output
    // Note: For web search, we'll need to use a third-party service or rely on the model's knowledge
    // For now, we use Chat Completions which is reliable and well-documented
    openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    if (openaiResponse.ok || openaiResponse.status !== 429) {
      break;
    }

    if (openaiResponse.status === 429 && attempt < maxRetries - 1) {
      const errorText = await openaiResponse.text();
      lastError = errorText;
      continue;
    }
  }

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text() || lastError || 'Unknown error';
    let errorMessage = 'OpenAI API error';
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorText.substring(0, 200);
      if (openaiResponse.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      }
    } catch {
      errorMessage = errorText.substring(0, 200);
    }
    throw new Error(errorMessage);
  }

  const data = await openaiResponse.json();
  
  // Extract content from Chat Completions response
  let outputText: string;
  if (data.choices && data.choices[0]?.message?.content) {
    outputText = data.choices[0].message.content;
  } else {
    throw new Error('No response content found in OpenAI API response');
  }

  if (!outputText) {
    throw new Error('No response from OpenAI API');
  }

  // Clean JSON from response (remove markdown code blocks if present)
  let cleanText = outputText.trim();
  cleanText = cleanText.replace(/```json\n?/gi, '');
  cleanText = cleanText.replace(/```\n?/g, '');
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanText = jsonMatch[0];
  }

  // Parse JSON
  let listingData: ListingData;
  try {
    listingData = JSON.parse(cleanText);
  } catch (parseError) {
    console.error('JSON Parse Error:', parseError);
    console.error('Raw response:', cleanText);
    throw new Error('Failed to parse property data from OpenAI response');
  }

  // Validate and normalize the data
  // Note: We allow missing address/price if using fallback - it's better than nothing
  if (!listingData.address && !listingData.price) {
    throw new Error('Incomplete property data: missing both address and price');
  }

  // Ensure numeric fields are numbers or null (NOT 0 for missing)
  listingData.price = listingData.price !== null && listingData.price !== undefined ? Number(listingData.price) : null;
  listingData.beds = listingData.beds !== null && listingData.beds !== undefined ? Number(listingData.beds) : null;
  listingData.baths = listingData.baths !== null && listingData.baths !== undefined ? Number(listingData.baths) : null;
  listingData.sqft = listingData.sqft !== null && listingData.sqft !== undefined ? Number(listingData.sqft) : null;
  listingData.yearBuilt = listingData.yearBuilt !== null && listingData.yearBuilt !== undefined ? Number(listingData.yearBuilt) : null;
  listingData.hoa = listingData.hoa !== null && listingData.hoa !== undefined ? Number(listingData.hoa) : null;
  listingData.lotSqft = listingData.lotSqft !== null && listingData.lotSqft !== undefined ? Number(listingData.lotSqft) : null;
  
  // Property tax: keep as provided (annual)
  if (listingData.propertyTax !== null && listingData.propertyTax !== undefined) {
    listingData.propertyTax = Number(listingData.propertyTax);
  }

  // Ensure arrays exist
  listingData.keyFeatures = listingData.keyFeatures || [];
  listingData.missingFields = listingData.missingFields || [];
  listingData.confidence = listingData.confidence || {};

  // Return with ingestion metadata
  return {
    listing: listingData,
    ingestion: {
      raw_text: rawText,
      source: 'google_search_fallback',
      notes: `Used Google Search with query "${queryUsed}" and extracted data from ${topResults.length} results`,
      searchProviderUsed: 'google',
      searchQueryUsed: queryUsed,
      numSearchResultsUsed: topResults.length
    }
  };
}

/**
 * Step B: OpenAI extraction with strict JSON schema
 */
async function extractListingWithOpenAI(
  url: string,
  rawText: string,
  source: string
): Promise<ListingData> {
  // Check both environment variable names for backward compatibility
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are a real estate data extraction assistant. Extract ONLY what is explicitly stated in the provided text. Never guess or invent values. If a field is not found, return null for that field. Output must match the JSON schema exactly.`;

  const userPrompt = `Extract property listing data from the following text. The text was obtained from: ${url} (source: ${source})

Raw text content:
${rawText}

Extract and return a JSON object with this EXACT structure:
{
  "address": "full street address with city, state, zip",
  "price": 425000,
  "beds": 3,
  "baths": 2,
  "sqft": 1850,
  "yearBuilt": 2015,
  "propertyType": "Single Family",
  "hoa": 0,
  "propertyTax": null,
  "lotSqft": null,
  "status": "For Sale",
  "keyFeatures": ["feature1", "feature2"],
  "missingFields": ["field1", "field2"],
  "confidence": {
    "address": 0.95,
    "price": 0.90,
    "beds": 0.85
  },
  "extractionNotes": "Brief notes about extraction quality"
}

RULES:
- address: Full address if found, otherwise null
- price: List price as number (no commas, no $)
- beds: Number of bedrooms (integer)
- baths: Number of bathrooms (can be decimal like 2.5)
- sqft: Square footage (integer)
- yearBuilt: Year built (integer) or null if not found
- propertyType: "Single Family", "Condo", "Townhouse", etc. or null
- hoa: Monthly HOA amount (number) or 0 if not found
- propertyTax: Annual property tax (number) or null if not found
- lotSqft: Lot size in square feet (number) or null
- status: "For Sale", "Sold", "Pending", etc. or null
- keyFeatures: Array of up to 8 key features (strings) or empty array
- missingFields: Array of field names that were not found in the text
- confidence: Object mapping each extracted field to a confidence score (0.0 to 1.0)
- extractionNotes: Brief explanation of what was found and any issues

IMPORTANT:
- Only extract values that are explicitly stated in the text
- If a field is not found, set it to null (or 0 for numbers, [] for arrays)
- Include all fields in missingFields that were not found
- Set confidence scores based on how clearly the data appears in the text
- Return ONLY valid JSON, no markdown, no code blocks, no explanations`;

  // Retry logic for rate limits
  let openaiResponse;
  let lastError;
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.pow(2, attempt - 1) * 1000;
      console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const model = attempt === 0 ? 'gpt-4o' : 'gpt-4o-mini';

    openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      })
    });

    if (openaiResponse.ok || openaiResponse.status !== 429) {
      break;
    }

    if (openaiResponse.status === 429 && attempt < maxRetries - 1) {
      const errorText = await openaiResponse.text();
      lastError = errorText;
      continue;
    }
  }

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text() || lastError || 'Unknown error';
    let errorMessage = 'OpenAI API error';
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorText.substring(0, 200);
      if (openaiResponse.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      }
    } catch {
      errorMessage = errorText.substring(0, 200);
    }
    throw new Error(errorMessage);
  }

  const data = await openaiResponse.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('No response from OpenAI API');
  }

  // Clean JSON from response
  let cleanText = text.trim();
  cleanText = cleanText.replace(/```json\n?/gi, '');
  cleanText = cleanText.replace(/```\n?/g, '');
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanText = jsonMatch[0];
  }

  let listingData: ListingData;
  try {
    listingData = JSON.parse(cleanText);
  } catch (parseError) {
    console.error('JSON Parse Error:', parseError);
    console.error('Raw response:', cleanText);
    throw new Error('Failed to parse property data from OpenAI response');
  }

  // Validate and normalize the data
  // Note: We allow missing address/price if using fallback - it's better than nothing
  if (!listingData.address && !listingData.price) {
    throw new Error('Incomplete property data: missing both address and price');
  }

  // Ensure numeric fields are numbers or null (NOT 0 for missing)
  listingData.price = listingData.price !== null && listingData.price !== undefined ? Number(listingData.price) : null;
  listingData.beds = listingData.beds !== null && listingData.beds !== undefined ? Number(listingData.beds) : null;
  listingData.baths = listingData.baths !== null && listingData.baths !== undefined ? Number(listingData.baths) : null;
  listingData.sqft = listingData.sqft !== null && listingData.sqft !== undefined ? Number(listingData.sqft) : null;
  listingData.yearBuilt = listingData.yearBuilt !== null && listingData.yearBuilt !== undefined ? Number(listingData.yearBuilt) : null;
  listingData.hoa = listingData.hoa !== null && listingData.hoa !== undefined ? Number(listingData.hoa) : null;
  listingData.lotSqft = listingData.lotSqft !== null && listingData.lotSqft !== undefined ? Number(listingData.lotSqft) : null;
  
  // Property tax: keep as provided (annual)
  if (listingData.propertyTax !== null && listingData.propertyTax !== undefined) {
    listingData.propertyTax = Number(listingData.propertyTax);
  }

  return listingData;
}

/**
 * Main function: Get listing data from URL
 */
async function getListingDataFromUrl(url: string): Promise<{ listing: ListingData; ingestion: IngestResult }> {
  let ingestion: IngestResult;
  let listing: ListingData;
  
  try {
    // Step 1: Try to ingest raw text via direct fetch
    ingestion = await ingestListingText(url);
    
    // Step 2: Extract with OpenAI from fetched text
    listing = await extractListingWithOpenAI(url, ingestion.raw_text, ingestion.source);
    
    // Step 3: Check if critical fields are missing - if so, use Google Search fallback
    if (hasCriticalMissingFields(listing)) {
      console.log('Critical fields missing, using Google Search fallback');
      const fallbackResult = await getListingDataFromGoogleSearch(url, undefined, undefined);
      listing = fallbackResult.listing;
      ingestion = fallbackResult.ingestion;
    }
  } catch (fetchError) {
    // Direct fetch failed (403/429/etc) - use Google Search fallback
    console.log('Direct fetch failed, using Google Search fallback:', fetchError);
    const fallbackResult = await getListingDataFromGoogleSearch(url, undefined, undefined);
    listing = fallbackResult.listing;
    ingestion = fallbackResult.ingestion;
  }
  
  return { listing, ingestion };
}

// API Handler
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return response.status(200).end();
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, address } = request.body;

    // Must have at least one: URL or address
    if (!url && !address) {
      return response.status(400).json({ error: 'URL or address is required' });
    }

    // If URL provided, validate format
    if (url) {
      try {
        new URL(url);
      } catch {
        return response.status(400).json({ error: 'Invalid URL format' });
      }
    }

    // For address, we'll need to search for the listing
    // If we have address but no URL, we'll use OpenAI web search
    let propertyUrl = url;
    if (!url && address) {
      // Create a placeholder URL that will trigger web search
      propertyUrl = `https://search.property.com/address/${encodeURIComponent(address || '')}`;
    }

    // Get listing data
    // If we have address but no URL, use OpenAI web search directly
    let listing: ListingData;
    let ingestion: IngestResult;
    
    if (!url && address) {
      // Use Google Search to find property by address
      const searchResult = await getListingDataFromGoogleSearch(undefined, undefined, address);
      listing = searchResult.listing;
      ingestion = searchResult.ingestion;
    } else {
      // Normal URL processing
      const result = await getListingDataFromUrl(propertyUrl);
      listing = result.listing;
      ingestion = result.ingestion;
    }

    // Convert to format expected by frontend (maintain backward compatibility)
    // Note: Keep null values as null (don't convert to 0) so frontend can show "Unknown"
    const propertyData = {
      address: listing.address || null,
      price: listing.price, // Can be null
      beds: listing.beds, // Can be null
      baths: listing.baths, // Can be null
      sqft: listing.sqft, // Can be null
      yearBuilt: listing.yearBuilt,
      propertyType: listing.propertyType || null,
      hoa: listing.hoa, // Can be null (use 0 only if explicitly $0)
      propertyTax: listing.propertyTax ? (listing.propertyTax > 1000 ? listing.propertyTax / 12 : listing.propertyTax) : null,
      // Include additional metadata
        _metadata: {
        source: ingestion.source,
        notes: ingestion.notes,
        extractionNotes: listing.extractionNotes,
        missingFields: listing.missingFields || [],
        confidence: listing.confidence || {},
        searchProviderUsed: ingestion.searchProviderUsed || 'none',
        searchQueryUsed: ingestion.searchQueryUsed,
        numSearchResultsUsed: ingestion.numSearchResultsUsed
      }
    };

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({
      success: true,
      propertyData,
      ingestion: {
        source: ingestion.source,
        notes: ingestion.notes
      }
    });

  } catch (error) {
    console.error('SMS Process Error:', error);
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Provide helpful error messages
    if (errorMessage.includes('Blocked') || errorMessage.includes('403')) {
      return response.status(200).json({
        success: false,
        error: 'The property listing website blocked our request. We attempted to use alternative methods, but limited data may be available.',
        details: errorMessage,
        suggestion: 'Try a different property listing URL or check if the listing is publicly accessible.'
      });
    }
    
    return response.status(500).json({ 
      error: errorMessage
    });
  }
}
