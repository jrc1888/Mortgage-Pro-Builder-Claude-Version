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
 * Lookup property tax from county assessor or listing sites
 */
async function lookupPropertyTax(address: string, price: number): Promise<number | null> {
  try {
    // Extract city/county from address for Utah
    const utahCounties = ['davis', 'salt lake', 'utah', 'weber', 'cache', 'box elder'];
    const addressLower = address.toLowerCase();
    const county = utahCounties.find(c => addressLower.includes(c));
    
    if (!county) {
      console.log('Could not determine county from address for tax lookup');
      return null;
    }

    // Search for property tax information
    const searchQueries = [
      `"${address}" property tax ${county} county assessor`,
      `"${address}" annual property tax ${county} county`,
      `"${address}" site:${county}county.org property tax`,
      `"${address}" property tax zillow`
    ];

    for (const query of searchQueries) {
      try {
        const searchResults = await googleSearch(query);
        if (searchResults.length > 0) {
          // Build text from search results
          let taxText = '';
          for (const result of searchResults.slice(0, 3)) {
            taxText += `${result.title}\n${result.snippet}\n${result.link}\n\n`;
          }

          // Use OpenAI to extract property tax amount
          const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
          if (!apiKey) break;

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                {
                  role: 'system',
                  content: 'Extract the annual property tax amount in dollars from the provided text. Return only a number (no commas, no $). If not found, return null.'
                },
                {
                  role: 'user',
                  content: `Find the annual property tax for: ${address}\n\nSearch results:\n${taxText}\n\nReturn the annual property tax amount as a number (e.g., 6500 for $6,500/year). If not found, return null.`
                }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1,
              max_tokens: 100
            })
          });

          if (response.ok) {
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) {
              const parsed = JSON.parse(content);
              const taxAmount = parsed.propertyTax || parsed.tax || parsed.amount;
              if (taxAmount && typeof taxAmount === 'number' && taxAmount > 0) {
                // Validate against Utah average (0.58% of home value)
                const utahAvgTax = price * 0.0058;
                const variance = Math.abs(taxAmount - utahAvgTax) / utahAvgTax;
                
                // If within 50% of average, use it; otherwise use average
                if (variance <= 0.5) {
                  console.log(`Found property tax: $${taxAmount}/year (validated against Utah average)`);
                  return taxAmount;
                } else {
                  console.log(`Property tax $${taxAmount} seems unusual (${(variance * 100).toFixed(0)}% variance), using Utah average`);
                  return null; // Will use estimate
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`Property tax lookup query failed: ${query}`);
        continue;
      }
    }
  } catch (error) {
    console.log('Property tax lookup failed:', error);
  }
  
  return null; // Will fall back to estimate
}

/**
 * Check if listing data has critical missing fields
 * Only trigger fallback if 2+ critical fields are missing (to avoid unnecessary fallbacks)
 */
function hasCriticalMissingFields(listing: ListingData): boolean {
  // Check if any critical field is missing (price, beds, baths, or sqft)
  // Note: We allow null values, so check for null/undefined specifically
  const missingPrice = listing.price === null || listing.price === undefined;
  const missingBeds = listing.beds === null || listing.beds === undefined;
  const missingBaths = listing.baths === null || listing.baths === undefined;
  const missingSqft = listing.sqft === null || listing.sqft === undefined;
  
  // If 2 or more critical fields are missing, use fallback
  const missingCount = [missingPrice, missingBeds, missingBaths, missingSqft].filter(Boolean).length;
  return missingCount >= 2;
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
    // Primary queries - try site-specific searches for major real estate sites
    // Search multiple sites to aggregate data
    searchQuery = `"${address}" site:zillow.com OR site:redfin.com OR site:utahrealestate.com`;
    // Fallback queries with different strategies
    fallbackQueries = [
      `"${address}" site:zillow.com`,
      `"${address}" site:redfin.com`,
      `"${address}" site:utahrealestate.com`,
      `"${address}" site:realtor.com`,
      `"${address}" zillow price beds baths sqft HOA`,
      `"${address}" property listing for sale`,
      `"${address}" real estate listing`,
      `"${address}" zillow`,
      `"${address}" redfin`,
      address // Just the address without quotes
    ];
  } else if (mlsNumber) {
    searchQuery = `"${mlsNumber}" MLS site:zillow.com OR site:redfin.com OR site:utahrealestate.com`;
    fallbackQueries = [
      `"${mlsNumber}" MLS site:zillow.com`,
      `"${mlsNumber}" MLS site:redfin.com`,
      `"${mlsNumber}" MLS site:utahrealestate.com`,
      `"${mlsNumber}" MLS site:realtor.com`,
      `MLS ${mlsNumber} zillow`,
      `MLS ${mlsNumber} property listing`,
      `MLS ${mlsNumber} real estate`,
      `MLS ${mlsNumber} property`,
      mlsNumber
    ];
  } else if (url) {
    // Extract address from URL for better search query
    const addressFromUrl = extractAddressFromUrl(url);
    if (addressFromUrl) {
      // If it's a Zillow URL, try Zillow-specific search
      if (url.includes('zillow.com')) {
        searchQuery = `"${addressFromUrl}" site:zillow.com`;
      } else if (url.includes('redfin.com')) {
        searchQuery = `"${addressFromUrl}" site:redfin.com`;
      } else {
        searchQuery = `"${addressFromUrl}" property listing`;
      }
      fallbackQueries = [
        `"${addressFromUrl}" site:zillow.com`,
        `"${addressFromUrl}" site:redfin.com`,
        `"${addressFromUrl}" zillow price beds baths`,
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

  // Build raw_text from search results - fetch from MULTIPLE real estate sites
  // Try to aggregate data from Zillow, Redfin, Utah Realtor, etc.
  const topResults = searchResults.slice(0, 5);
  let rawText = '';
  
  // Known real estate sites - prioritize these
  const realEstateDomains = [
    'zillow.com',
    'redfin.com', 
    'realtor.com',
    'utahrealestate.com',
    'homes.com',
    'trulia.com',
    'century21.com',
    'remax.com'
  ];
  
  // Track which sites we've fetched from
  const fetchedSites: string[] = [];
  const maxFetches = 3; // Fetch from up to 3 different sites for aggregation
  
  for (const result of topResults) {
    const matchedDomain = realEstateDomains.find(domain => result.link.includes(domain));
    const isRealEstateSite = !!matchedDomain;
    
    // Try to fetch actual page content from real estate sites
    if (isRealEstateSite && fetchedSites.length < maxFetches && !fetchedSites.includes(matchedDomain!)) {
      try {
        const pageResponse = await fetch(result.link, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
          redirect: 'follow',
        });
        
        if (pageResponse.ok) {
          const htmlContent = await pageResponse.text();
          const plainText = htmlToPlainText(htmlContent);
          const truncatedText = plainText.length > 25000 
            ? plainText.substring(0, 25000) + '... [truncated]'
            : plainText;
          
          rawText += `=== Fetched from ${matchedDomain}: ${result.link} ===\n`;
          rawText += `${truncatedText}\n\n`;
          fetchedSites.push(matchedDomain!);
          continue; // Skip adding snippet since we have full content
        }
      } catch (fetchError) {
        // If fetch fails, fall back to snippet
        console.log(`Failed to fetch ${result.link}, using snippet instead`);
      }
    }
    
    // Use snippet if we couldn't fetch or it's not a real estate site
    rawText += `Title: ${result.title}\n`;
    rawText += `Snippet: ${result.snippet}\n`;
    rawText += `Link: ${result.link}\n\n`;
  }
  
  // If we didn't fetch any full pages, at least we have snippets
  if (fetchedSites.length === 0) {
    console.log('Warning: Could not fetch full pages from any real estate sites, using snippets only');
  } else {
    console.log(`Fetched full pages from: ${fetchedSites.join(', ')}`);
  }

  const instructions = `You are a real estate data extraction assistant. Extract COMPLETE property listing information from the provided search results or page content.

CRITICAL EXTRACTION RULES:
1. Extract ALL available information from the provided content. Be thorough and look for:
   - Price: Look for "$", "price", "list price", "asking price", "for sale"
   - Beds: Look for "bed", "bedroom", "BR", "beds"
   - Baths: Look for "bath", "bathroom", "BA", "baths" (can be decimal like 2.5)
   - Sqft: Look for "sq ft", "square feet", "sqft", "SF", "square footage"
   - Year Built: Look for "built", "year built", "constructed"
   - Property Type: Look for "Single Family", "Condo", "Townhouse", "Multi-Family", etc.
   - HOA (CRITICAL - LOOK VERY CAREFULLY): 
     * Look for "$20/mo HOA", "$20 monthly HOA", "$20/mo" followed by "HOA"
     * Look for "HOA fee", "HOA dues", "homeowners association fee"
     * Look for "$/mo" patterns near "HOA" or "association"
     * On Zillow: Look in property details section for "$X/mo" or "$X monthly" near HOA
     * Extract ONLY the dollar amount (e.g., "$20/mo HOA" = 20, "$150/month HOA" = 150)
     * If explicitly "$0" or "No HOA" = 0
     * If not found = null (NOT 0)
     * THIS IS CRITICAL FOR PAYMENT CALCULATION
   - Property Tax: Look for "property tax", "taxes", "annual tax"
   - Lot Size: Look for "lot", "lot size", "acre", "sq ft lot"
   - Status: Look for "For Sale", "Sold", "Pending", "Active"

2. Extract ONLY verifiable facts from the content. Never guess or invent values.
3. If a field cannot be determined from the content, return null (NOT 0 or empty string).
4. Include all fields you could not find in the missingFields array.
5. Set confidence scores (0.0 to 1.0) for each field based on how certain you are.
6. Return a valid JSON object matching the required schema.

Return a JSON object with these fields:
- address: Full street address with city, state, zip (or null)
- price: List price as number, no commas, no $ (or null) - THIS IS CRITICAL, LOOK CAREFULLY
- beds: Number of bedrooms (or null) - THIS IS CRITICAL, LOOK CAREFULLY
- baths: Number of bathrooms, can be decimal like 2.5 (or null) - THIS IS CRITICAL, LOOK CAREFULLY
- sqft: Square footage (or null) - THIS IS CRITICAL, LOOK CAREFULLY
- yearBuilt: Year built (or null)
- propertyType: Property type like "Single Family", "Condo", "Townhouse" (or null)
- hoa: Monthly HOA amount in dollars (e.g., if it says "$20/mo" or "$20 monthly", return 20). Use 0 only if explicitly stated as $0. Return null if not found. THIS IS CRITICAL - look carefully for HOA fees.
- propertyTax: Annual property tax (or null)
- lotSqft: Lot size in square feet (or null)
- status: Status like "For Sale", "Sold", "Pending" (or null)
- keyFeatures: Array of up to 8 key features (empty array if none)
- missingFields: Array of field names that were not found in the search results
- confidence: Object mapping each extracted field to a confidence score (0.0 to 1.0)
- extractionNotes: Brief explanation of what was found and any issues

Return ONLY valid JSON, no markdown, no code blocks.`;

  const input = `Extract COMPLETE property listing data from these search results and page content:

${rawText}

${address ? `Target property address: ${address}` : ''}
${mlsNumber ? `Target MLS number: ${mlsNumber}` : ''}
${url ? `Original URL: ${url}` : ''}

CAREFULLY extract ALL property information from the content above. You have data from multiple sources - aggregate and cross-reference to find the most accurate values.

Pay special attention to finding:
- Price (look for dollar amounts, "for sale", "list price", "asking price") - make sure you get the CORRECT price for the exact address
- Beds (look for "bed", "bedroom", "BR", "4 beds", "4 bed")
- Baths (look for "bath", "bathroom", "BA", "3 baths", "3 bath")
- Sqft (look for "sq ft", "square feet", "sqft", "3,695 sqft", "3695 sq ft")
- HOA (look for "HOA", "$20/mo HOA", "monthly HOA", "HOA fee", "association fee") - THIS IS CRITICAL
- Year Built (look for "Built in", "Built", "Year built", "constructed")
- Property Type (look for "Single Family", "Condo", "Townhouse")

IMPORTANT: If you have data from multiple sources (Zillow, Redfin, etc.), use the most common value or the value from the most authoritative source. Make sure the address matches exactly.

Use null for any fields you cannot confidently determine from the provided content. Include all missing fields in the missingFields array.`;

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

  // Try property tax lookup if missing
  if ((listingData.propertyTax === null || listingData.propertyTax === undefined) && listingData.address && listingData.price) {
    console.log('Property tax missing from Google Search results, attempting lookup...');
    const lookedUpTax = await lookupPropertyTax(listingData.address, listingData.price);
    if (lookedUpTax !== null) {
      listingData.propertyTax = lookedUpTax;
      console.log(`Found property tax via lookup: $${lookedUpTax}/year`);
    }
  }

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

  const systemPrompt = `You are a real estate data extraction assistant. Extract COMPLETE property listing information from the provided text. Be thorough and look for ALL fields including HOA fees and year built. Extract ONLY what is explicitly stated in the text. Never guess or invent values. If a field is not found, return null for that field. Output must match the JSON schema exactly.`;

  const userPrompt = `Extract property listing data from the following text. The text was obtained from: ${url} (source: ${source})

CRITICAL: Look carefully for these fields - HOA IS ESPECIALLY IMPORTANT:

- HOA (CRITICAL - LOOK VERY CAREFULLY): 
  * Look for "$20/mo HOA", "$20 monthly HOA", "$20/mo" followed by "HOA"
  * Look for "HOA fee", "HOA dues", "homeowners association fee"
  * Look for "$/mo" patterns near the word "HOA" or "association"
  * On Zillow, HOA often appears as "$20/mo" or "$20 monthly" in the property details section
  * Extract ONLY the dollar amount (e.g., "$20/mo HOA" = 20, "$150/month HOA" = 150)
  * If HOA is explicitly stated as "$0" or "No HOA", return 0
  * If HOA is not mentioned at all, return null (NOT 0)

- Year Built (CRITICAL for insurance calculation):
  * Look for "Built in 2025", "Built 2025", "Year built: 2025", "constructed in 2025"
  * Look for "Built:" followed by a year
  * Look for patterns like "2025" near construction/built keywords
  * This is CRITICAL - insurance rates depend on this value

- Property Tax: Look for "property tax", "annual tax", "taxes", "$X/year" or "$X annually" for property tax
- Price: Look for "$1,099,900", "price", "list price", "asking price"
- Beds: Look for "4 beds", "4 bed", "4 bedrooms", "4 BR"
- Baths: Look for "3 baths", "3 bath", "3 bathrooms", "3 BA"
- Sqft: Look for "3,695 sqft", "3695 sq ft", "square feet"

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
  "hoa": 20,
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
- yearBuilt: Year built (integer) - look carefully for "Built in 2025", "Built 2025", "Year built: 2025", "constructed in 2025", or "Built:" followed by a year. Return null if not found
- propertyType: "Single Family", "Condo", "Townhouse", etc. or null
- hoa: Monthly HOA amount in dollars. CRITICAL: Look very carefully for HOA fees. Common patterns:
  * "$20/mo HOA" = 20
  * "$20 monthly HOA" = 20  
  * "$150/month HOA" = 150
  * "HOA: $20/mo" = 20
  * "$20/mo" near "HOA" or "association" = 20
  * If explicitly "$0" or "No HOA" = 0
  * If not found anywhere = null (NOT 0)
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
    
    // Step 2.5: If property tax is missing but we have address and price, try to lookup
    if ((listing.propertyTax === null || listing.propertyTax === undefined) && listing.address && listing.price) {
      console.log('Property tax missing, attempting lookup from county/listing sites...');
      const lookedUpTax = await lookupPropertyTax(listing.address, listing.price);
      if (lookedUpTax !== null) {
        listing.propertyTax = lookedUpTax;
        console.log(`Found property tax via lookup: $${lookedUpTax}/year`);
      }
    }
    
    // Step 3: Check if critical fields are missing - if so, use Google Search fallback
    if (hasCriticalMissingFields(listing)) {
      console.log('Critical fields missing, using Google Search fallback');
      const fallbackResult = await getListingDataFromGoogleSearch(url, undefined, undefined);
      listing = fallbackResult.listing;
      ingestion = fallbackResult.ingestion;
      
      // Try property tax lookup for fallback result too
      if ((listing.propertyTax === null || listing.propertyTax === undefined) && listing.address && listing.price) {
        const lookedUpTax = await lookupPropertyTax(listing.address, listing.price);
        if (lookedUpTax !== null) {
          listing.propertyTax = lookedUpTax;
        }
      }
    }
  } catch (fetchError) {
    // Direct fetch failed (403/429/etc) - use Google Search fallback
    console.log('Direct fetch failed, using Google Search fallback:', fetchError);
    const fallbackResult = await getListingDataFromGoogleSearch(url, undefined, undefined);
    listing = fallbackResult.listing;
    ingestion = fallbackResult.ingestion;
    
    // Try property tax lookup for fallback result too
    if ((listing.propertyTax === null || listing.propertyTax === undefined) && listing.address && listing.price) {
      const lookedUpTax = await lookupPropertyTax(listing.address, listing.price);
      if (lookedUpTax !== null) {
        listing.propertyTax = lookedUpTax;
      }
    }
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

    // Determine if we have a real URL or just an address
    const hasRealUrl = url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('search.property.com');

    // Get listing data
    let listing: ListingData;
    let ingestion: IngestResult;
    
    if (!hasRealUrl && address) {
      // No real URL, just address - use Google Search directly
      const searchResult = await getListingDataFromGoogleSearch(undefined, undefined, address);
      listing = searchResult.listing;
      ingestion = searchResult.ingestion;
    } else if (hasRealUrl) {
      // Real URL provided - try direct fetch first, fallback to Google Search
      const result = await getListingDataFromUrl(url);
      listing = result.listing;
      ingestion = result.ingestion;
    } else {
      return response.status(400).json({ error: 'Either a valid URL or address is required' });
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
