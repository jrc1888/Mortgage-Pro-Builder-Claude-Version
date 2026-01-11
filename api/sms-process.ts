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
  source: 'direct_fetch' | 'google_search_fallback' | 'direct_url_construction';
  notes: string;
  needsFallback?: boolean;
  searchProviderUsed?: 'google' | 'none';
  searchQueryUsed?: string;
  numSearchResultsUsed?: number;
  extractionDetails?: {
    extractionLog: Array<{
      source: string;
      url: string;
      extracted: {
        address: string | null;
        price: number | null;
        beds: number | null;
        baths: number | null;
        sqft: number | null;
        hoa: number | null;
        yearBuilt: number | null;
        confidence?: Record<string, number>;
      };
    }>;
    aggregationDetails: {
      totalSources: number;
      matchedSources: number;
      filteredSources: number;
      targetAddress: string | null;
      sources: Array<{
        address: string | null;
        price: number | null;
        beds: number | null;
        baths: number | null;
        sqft: number | null;
        hoa: number | null;
        yearBuilt: number | null;
        confidence?: Record<string, number>;
      }>;
      fieldVotes: {
        price: Record<string, number>;
        beds: Record<string, number>;
        baths: Record<string, number>;
        sqft: Record<string, number>;
        hoa: Record<string, number>;
        yearBuilt: Record<string, number>;
      };
    };
  };
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
    console.error('Missing Google Search API credentials');
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
      console.error(`Query was: ${query}`);
      throw new Error(`Google Search API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      console.log(`Google Search returned 0 results for query: ${query}`);
      console.log(`Response data:`, JSON.stringify(data).substring(0, 200));
      return [];
    }

    console.log(`Google Search returned ${data.items.length} results for query: ${query}`);
    // Return top 5 results
    return data.items.slice(0, 5).map((item: any) => ({
      title: item.title || '',
      snippet: item.snippet || '',
      link: item.link || ''
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Google Search timed out for query: ${query}`);
      throw new Error('Google Search API request timed out after 10 seconds');
    }
    console.error(`Google Search error for query: ${query}`, error);
    throw error;
  }
}

/**
 * Parse address into components with improved regex patterns
 * Handles formats like:
 * - "581 W Summerhill Lane, Centerville, UT 84014"
 * - "123 Main St, Salt Lake City, UT 84101"
 * - "456 E 100 S, Provo, UT 84601"
 */
function parseAddress(address: string): {
  streetNum: string;
  streetName: string;
  city: string;
  state: string;
  zip: string;
} | null {
  // Clean up the address
  const cleaned = address.trim();
  
  // Try multiple regex patterns to handle different address formats
  const patterns = [
    // Pattern 1: Full format with comma separators
    // "581 W Summerhill Lane, Centerville, UT 84014"
    /^(\d+)\s+(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})$/i,
    
    // Pattern 2: No comma after street name
    // "581 W Summerhill Lane Centerville, UT 84014"
    /^(\d+)\s+(.+?)\s+([A-Za-z\s]+),\s*([A-Z]{2})\s+(\d{5})$/i,
    
    // Pattern 3: Minimal commas
    // "581 W Summerhill Lane Centerville UT 84014"
    /^(\d+)\s+(.+?)\s+([A-Za-z\s]+)\s+([A-Z]{2})\s+(\d{5})$/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let [, streetNum, streetName, city, state, zip] = match;
      
      // For pattern 2 and 3, we need to intelligently split streetName and city
      if (pattern !== patterns[0]) {
        // The streetName might contain the city at the end
        // Try to find where the street ends and city begins
        // Common street types: Lane, Street, Road, Avenue, Drive, etc.
        const streetTypes = ['lane', 'street', 'road', 'avenue', 'drive', 'way', 'circle', 'court', 'place', 'boulevard', 'parkway', 'terrace'];
        const streetNameLower = streetName.toLowerCase();
        
        let splitIndex = -1;
        for (const type of streetTypes) {
          const idx = streetNameLower.indexOf(' ' + type);
          if (idx > -1) {
            splitIndex = idx + type.length + 1; // +1 for the space
            break;
          }
        }
        
        if (splitIndex > -1 && pattern !== patterns[0]) {
          // Split at the street type
          const actualStreetName = streetName.substring(0, splitIndex).trim();
          const actualCity = streetName.substring(splitIndex).trim() + ' ' + city.trim();
          streetName = actualStreetName;
          city = actualCity.trim();
        }
      }
      
      return {
        streetNum: streetNum.trim(),
        streetName: streetName.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zip: zip.trim()
      };
    }
  }
  
  console.log(`Failed to parse address with all patterns: ${address}`);
  return null;
}

/**
 * Try to construct direct URLs for known working sites and fetch from them
 * IMPROVED VERSION with better address parsing and more URL variations
 */
async function tryDirectUrlConstruction(address: string): Promise<{ listing: ListingData; ingestion: IngestResult } | null> {
  try {
    console.log(`\n=== DIRECT URL CONSTRUCTION START ===`);
    console.log(`Input address: ${address}`);
    
    // Parse address components with improved regex
    const parsed = parseAddress(address);
    if (!parsed) {
      console.log('Failed to parse address - skipping direct URL construction');
      return null;
    }
    
    const { streetNum, streetName, city, state, zip } = parsed;
    console.log(`Parsed address components:`, parsed);
    
    // Normalize components for URL construction
    const urlSafeStreet = streetName.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const urlSafeCity = city.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const urlSafeState = state.toLowerCase();
    
    console.log(`URL-safe components: street=${urlSafeStreet}, city=${urlSafeCity}, state=${urlSafeState}, zip=${zip}`);
    
    // Known working sites - try multiple URL variations for each
    const urlPatterns = [
      `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet.toUpperCase()}-${urlSafeCity}-${urlSafeState}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet}-${urlSafeCity.toUpperCase()}-${urlSafeState.toUpperCase()}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-W-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-N-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-E-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
      `https://www.utahrealestate.com/${streetNum}-S-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
      `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-${zip}/home/`,
      `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-N-${zip}/home/`,
      `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-W-${zip}/home/`,
      `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-E-${zip}/home/`,
      `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-S-${zip}/home/`,
      `https://www.redfin.com/${state}/${urlSafeCity}/${urlSafeStreet}-${zip}/home/`,
      `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${state}-${zip}/`,
      `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-N-${urlSafeCity}-${state}-${zip}/`,
      `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-W-${urlSafeCity}-${state}-${zip}/`,
      `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-E-${urlSafeCity}-${state}-${zip}/`,
      `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-S-${urlSafeCity}-${state}-${zip}/`,
      `https://www.homes.com/property/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}/`,
      `https://www.homes.com/property/${streetNum}-${urlSafeStreet}-n-${urlSafeCity}-${urlSafeState}/`,
      `https://www.homes.com/property/${streetNum}-${urlSafeStreet}-w-${urlSafeCity}-${urlSafeState}/`,
      `https://www.homes.com/property/${streetNum}-${urlSafeStreet}-e-${urlSafeCity}-${urlSafeState}/`,
      `https://www.homes.com/property/${streetNum}-${urlSafeStreet}-s-${urlSafeCity}-${urlSafeState}/`,
      `https://www.homes.com/property/${urlSafeStreet}-${urlSafeCity}-${urlSafeState}/`,
    ];
    
    console.log(`Trying ${urlPatterns.length} URL patterns...`);
    
    for (let i = 0; i < urlPatterns.length; i++) {
      const urlPattern = urlPatterns[i];
      try {
        console.log(`[${i + 1}/${urlPatterns.length}] Trying: ${urlPattern}`);
        
        const fetchResponse = await fetch(urlPattern, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000), // 8 second timeout
        });
        
        console.log(`Response status: ${fetchResponse.status} ${fetchResponse.statusText}`);
        
        if (fetchResponse.ok) {
          const htmlContent = await fetchResponse.text();
          const plainText = htmlToPlainText(htmlContent);
          
          console.log(`Fetched ${plainText.length} characters of plain text`);
          
          if (plainText && plainText.trim().length >= 100) {
            // Found a working URL - extract data
            console.log(`Attempting extraction from ${urlPattern}...`);
            const listing = await extractListingWithOpenAISinglePage(urlPattern, plainText, 'direct_url_construction', address);
            
            // Validate that we got useful data
            // Be lenient: if we got price OR (beds AND baths), consider it valid
            const hasPrice = listing.price !== null && listing.price > 0;
            const hasBasicData = (listing.beds !== null && listing.beds > 0) || (listing.baths !== null && listing.baths > 0);
            const hasAddress = listing.address && listing.address.length > 5;
            
            console.log(`Extraction results: hasPrice=${hasPrice}, hasBasicData=${hasBasicData}, hasAddress=${hasAddress}`);
            
            if (hasPrice || hasBasicData) {
              // Address matching is lenient - just check if we have SOME address
              if (hasAddress) {
                console.log(`✓ Successfully extracted data from ${urlPattern}`);
                console.log(`  Address: ${listing.address}`);
                console.log(`  Price: $${listing.price}`);
                console.log(`  Beds: ${listing.beds}, Baths: ${listing.baths}`);
                console.log(`=== DIRECT URL CONSTRUCTION SUCCESS ===\n`);
                
                return {
                  listing,
                  ingestion: {
                    raw_text: plainText.substring(0, 5000),
                    source: 'direct_url_construction',
                    notes: `Successfully fetched from constructed URL: ${urlPattern}`,
                    searchProviderUsed: 'none',
                    searchQueryUsed: undefined,
                    numSearchResultsUsed: undefined
                  }
                };
              } else {
                console.log(`✗ Extracted data but missing address`);
              }
            } else {
              console.log(`✗ Extracted data doesn't have price or basic info`);
            }
          } else {
            console.log(`✗ Fetched content too short (${plainText.length} chars)`);
          }
        } else if (fetchResponse.status === 404) {
          console.log(`✗ Page not found (404)`);
        } else if (fetchResponse.status === 403) {
          console.log(`✗ Access forbidden (403) - site may be blocking automated requests`);
        } else {
          console.log(`✗ HTTP error: ${fetchResponse.status}`);
        }
      } catch (urlError) {
        const errorMsg = urlError instanceof Error ? urlError.message : 'Unknown error';
        console.log(`✗ Fetch failed: ${errorMsg}`);
        continue;
      }
    }
    
    console.log(`=== DIRECT URL CONSTRUCTION FAILED - No working URLs found ===\n`);
    return null; // None of the constructed URLs worked
  } catch (error) {
    console.error('Direct URL construction error:', error);
    return null;
  }
}

/**
 * Convert HTML to plain text for OpenAI extraction
 */
function htmlToPlainText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ');
  text = text.trim();
  
  return text;
}

/**
 * Extract listing data from a single page using OpenAI
 */
async function extractListingWithOpenAISinglePage(
  url: string,
  rawText: string,
  source: string,
  targetAddress?: string | null
): Promise<ListingData> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Truncate very long text to stay within token limits
  const maxLength = 100000; // ~25k tokens
  const truncatedText = rawText.length > maxLength ? rawText.substring(0, maxLength) : rawText;

  const instructions = `You are a real estate data extraction assistant. Extract property listing information from the provided webpage content.

IMPORTANT RULES:
1. Extract ONLY information that appears in the webpage content. Never guess or invent values.
2. For missing fields, return null (not 0).
3. Validate that numbers are reasonable (e.g., price > 10000, beds 1-10, baths 1-10, sqft 100-20000).
4. Property tax should be ANNUAL amount in dollars.
5. HOA should be MONTHLY amount in dollars (convert if needed).
6. If you see "year built" or "built in YYYY", extract as yearBuilt.
7. Confidence scores should reflect how certain you are (0.0 to 1.0).

${targetAddress ? `TARGET ADDRESS: ${targetAddress}\nValidate that the extracted address matches this target address.` : ''}

Return a JSON object with:
- address: Full property address (string)
- price: Listing price in dollars (number or null)
- beds: Number of bedrooms (number or null)
- baths: Number of bathrooms (number or null) 
- sqft: Square footage (number or null)
- yearBuilt: Year built (number or null)
- propertyType: Type (e.g. "Single Family", "Condo", "Townhouse")
- hoa: Monthly HOA fee in dollars (number or null, 0 if explicitly no HOA)
- propertyTax: Annual property tax in dollars (number or null)
- lotSqft: Lot size in square feet (number or null)
- status: Listing status (e.g. "Active", "Pending", "Sold")
- keyFeatures: Array of key features (max 8)
- missingFields: Array of field names that were not found
- confidence: Object with confidence scores for each field (0.0 to 1.0)
- extractionNotes: Brief note about extraction quality`;

  const input = `URL: ${url}\nSource: ${source}\n\nWebpage content:\n${truncatedText}`;

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
        max_tokens: 1500
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errorText.substring(0, 200)}`);
    }

    const data = await openaiResponse.json();
    const outputText = data.choices?.[0]?.message?.content;

    if (!outputText) {
      throw new Error('No response from OpenAI API');
    }

    // Clean and parse JSON
    let cleanText = outputText.trim();
    cleanText = cleanText.replace(/```json\n?/gi, '');
    cleanText = cleanText.replace(/```\n?/g, '');
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }

    const listingData: ListingData = JSON.parse(cleanText);

    // Validate and normalize
    if (!listingData.address && !listingData.price) {
      throw new Error('Incomplete property data: missing both address and price');
    }

    // Ensure numeric fields are numbers or null
    listingData.price = listingData.price !== null && listingData.price !== undefined ? Number(listingData.price) : null;
    listingData.beds = listingData.beds !== null && listingData.beds !== undefined ? Number(listingData.beds) : null;
    listingData.baths = listingData.baths !== null && listingData.baths !== undefined ? Number(listingData.baths) : null;
    listingData.sqft = listingData.sqft !== null && listingData.sqft !== undefined ? Number(listingData.sqft) : null;
    listingData.yearBuilt = listingData.yearBuilt !== null && listingData.yearBuilt !== undefined ? Number(listingData.yearBuilt) : null;
    listingData.hoa = listingData.hoa !== null && listingData.hoa !== undefined ? Number(listingData.hoa) : null;
    listingData.lotSqft = listingData.lotSqft !== null && listingData.lotSqft !== undefined ? Number(listingData.lotSqft) : null;
    listingData.propertyTax = listingData.propertyTax !== null && listingData.propertyTax !== undefined ? Number(listingData.propertyTax) : null;

    return listingData;
  } catch (error) {
    console.error('OpenAI extraction error:', error);
    throw error;
  }
}

/**
 * Extract address from URL patterns
 */
function extractAddressFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Zillow: /homedetails/581-W-Summerhill-Ln-N-Centerville-UT-84014/450680059_zpid/
    if (url.includes('zillow.com')) {
      const match = pathname.match(/\/homedetails\/([^\/]+)/);
      if (match) {
        // Split by dashes to get address components
        const parts = match[1].split('-');
        
        // Find zip (last part that's 5 digits) and state (2-letter code before zip)
        let zip = '';
        let stateIndex = -1;
        
        for (let i = parts.length - 1; i >= 0; i--) {
          if (/^\d{5}$/.test(parts[i])) {
            zip = parts[i];
            if (i > 0 && /^[A-Z]{2}$/i.test(parts[i - 1])) {
              stateIndex = i - 1;
            }
            break;
          }
        }
        
        if (zip && stateIndex > 0) {
          const state = parts[stateIndex].toUpperCase();
          // City is typically the part before state
          const city = parts[stateIndex - 1] || parts[stateIndex - 2] || '';
          // Everything before city is street
          const streetParts = parts.slice(0, stateIndex - 1);
          const street = streetParts.join(' ');
          
          // Format as: "Street, City, State Zip" (comma format works best with parseAddress)
          return `${street}, ${city}, ${state} ${zip}`;
        }
      }
    }
    
    // Redfin: /UT/Centerville/581-W-Summerhill-Ln-84014/home/
    if (url.includes('redfin.com')) {
      const match = pathname.match(/\/([A-Z]{2})\/([^\/]+)\/([^\/]+)\/home/);
      if (match) {
        const [, state, city, street] = match;
        return street.replace(/-/g, ' ') + ', ' + city.replace(/-/g, ' ') + ', ' + state;
      }
    }
    
    // Homes.com: /property/581-w-summerhill-ln-centerville-ut/
    if (url.includes('homes.com')) {
      const match = pathname.match(/\/property\/([^\/]+)/);
      if (match) {
        return match[1]
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    // UtahRealEstate.com: /581-w-summerhill-lane-centerville-ut-84014/
    if (url.includes('utahrealestate.com')) {
      const match = pathname.match(/\/([^\/]+)\/$/);
      if (match) {
        return match[1]
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Ingest listing text via direct fetch from URL
 */
async function ingestListingText(url: string): Promise<IngestResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const htmlContent = await response.text();
    const plainText = htmlToPlainText(htmlContent);

    if (!plainText || plainText.length < 100) {
      throw new Error('Fetched content too short or empty');
    }

    return {
      raw_text: plainText,
      source: 'direct_fetch',
      notes: 'Successfully fetched page content directly',
      searchProviderUsed: 'none'
    };
  } catch (error) {
    throw new Error(`Direct fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if listing has critical missing fields
 */
function hasCriticalMissingFields(listing: ListingData): boolean {
  return !listing.price || !listing.beds || !listing.baths || !listing.sqft;
}

/**
 * Check if two addresses match (lenient comparison)
 */
function addressesMatch(addr1: string, addr2: string): boolean {
  const normalize = (addr: string) => 
    addr.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '');
  
  return normalize(addr1) === normalize(addr2);
}

/**
 * Lookup property tax from various sources
 */
async function lookupPropertyTax(address: string, price: number): Promise<number | null> {
  // This is a placeholder - implement actual tax lookup logic
  // Could use county assessor APIs or estimate based on price
  return null;
}

/**
 * Enrichment Configuration
 */
const ENRICHMENT_CONFIG = {
  criticalFields: ['hoa', 'yearBuilt', 'propertyTax', 'lotSqft'] as const,
  highPriorityFields: ['hoa', 'propertyTax'] as const, // 🆕 ALWAYS trigger enrichment for these
  minMissingFieldsToTrigger: 1,
  maxEnrichmentAttempts: 3,
  sources: [
    {
      name: 'redfin',
      priority: 1,
      description: 'Redfin (has actual property tax from county records)',
      searchQuery: (address: string) => `${address} site:redfin.com`,
      targetFields: ['propertyTax', 'yearBuilt', 'hoa', 'lotSqft'],
      hoaReliability: 'high' as const // 🆕 HOA data quality indicator
    },
    {
      name: 'zillow',
      priority: 2, // 🆕 Moved up in priority for HOA
      description: 'Zillow (comprehensive property data, excellent HOA coverage)',
      searchQuery: (address: string) => `${address} site:zillow.com`,
      targetFields: ['propertyTax', 'hoa', 'yearBuilt', 'lotSqft'],
      hoaReliability: 'high' as const // 🆕 Zillow is very reliable for HOA
    },
    {
      name: 'utahrealestate',
      priority: 3, // 🆕 Moved down slightly
      description: 'UtahRealEstate (has HOA, year built, lot size from MLS)',
      searchQuery: (address: string) => `${address} site:utahrealestate.com`,
      targetFields: ['hoa', 'yearBuilt', 'lotSqft', 'propertyTax'],
      hoaReliability: 'medium' as const // 🆕 Less consistent HOA data
    }
  ] as const
};

/**
 * Use Google Search to find actual property listing URLs for a given address
 * This replaces URL pattern guessing with actual URL discovery
 */
async function findPropertyUrlViaGoogle(
  address: string,
  sourceName: string,
  siteDomain: string
): Promise<string | null> {
  console.log(`🔍 Searching Google for ${sourceName} listing...`);
  
  // Parse address to extract components
  const parsed = parseAddress(address);
  if (!parsed) {
    console.log(`   ✗ Could not parse address: ${address}`);
    return null;
  }
  
  const { streetNum, streetName, city, state, zip } = parsed;
  
  // Build multiple search query variations to maximize chances of finding the page
  let searchQueries: string[] = [];
  
  if (sourceName === 'redfin') {
    searchQueries = [
      // Most specific - full address with path hint
      `"${streetNum} ${streetName}" "${zip}" site:redfin.com/${state}/${city}`,
      // Street name and zip with home path
      `"${streetName}" "${zip}" site:redfin.com/home`,
      // Street number and key words from street name
      `${streetNum} ${streetName.split(' ')[0]} ${city} site:redfin.com/${state}`,
      // Simple address with site
      `${address} site:redfin.com`,
      // Just street and city for broader match
      `"${streetName}" ${city} ${state} site:redfin.com`
    ];
  } else if (sourceName === 'utahrealestate') {
    searchQueries = [
      // Most specific with pid pattern
      `"${streetNum} ${streetName}" "${zip}" site:utahrealestate.com/pid`,
      // Full address
      `${address} site:utahrealestate.com`,
      // Street name and ZIP
      `"${streetName}" "${zip}" site:utahrealestate.com`,
      // City and street
      `"${streetName}" ${city} site:utahrealestate.com`
    ];
  }
  
  // BAD URL PATTERNS - These are aggregate pages, not individual property listings
  const badPatterns = [
    /\/zipcode\//i,           // ZIP code pages
    /\/city\//i,              // City pages
    /\/roster\//i,            // Office roster pages
    /\/office\//i,            // Office pages
    /\/agent\//i,             // Agent pages
    /\/search/i,              // Search results pages
    /\/browse/i,              // Browse pages
    /\/find/i,                // Find pages
    /listings\.report/i       // Listing report pages (multi-property)
  ];
  
  // Try each query variation
  for (let i = 0; i < searchQueries.length; i++) {
    const searchQuery = searchQueries[i];
    console.log(`   [${i + 1}/${searchQueries.length}] Query: "${searchQuery}"`);
    
    try {
      const searchResults = await googleSearch(searchQuery);
      
      if (!searchResults || searchResults.length === 0) {
        console.log(`   ✗ No results found`);
        continue;
      }
      
      console.log(`   Found ${searchResults.length} results, filtering...`);
      
      // Filter results to find the best property page URL
      for (const item of searchResults) {
        const url = item.link;
        
        // Skip if URL matches any bad pattern
        if (badPatterns.some(pattern => pattern.test(url))) {
          console.log(`   ✗ Skipping (aggregate): ${url}`);
          continue;
        }
        
        // For Redfin: Look for the pattern /home/[propertyId]
        if (sourceName === 'redfin') {
          if (url.includes('/home/') && /\/\d+\/?$/.test(url)) {
            console.log(`   ✓ Found property page: ${url}`);
            return url;
          }
        }
        
        // For UtahRealEstate: Look for URLs with address patterns
        if (sourceName === 'utahrealestate') {
          const hasStreetNum = url.toLowerCase().includes(streetNum);
          const hasZip = url.includes(zip);
          const hasPropertyPattern = /pid\.\d+|mls.*\d+/i.test(url);
          
          if ((hasStreetNum || hasZip) && hasPropertyPattern) {
            console.log(`   ✓ Found property page: ${url}`);
            return url;
          }
        }
      }
      
      console.log(`   No property page in these results, trying next query...`);
      
    } catch (error) {
      console.log(`   ✗ Search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }
  
  console.log(`   ⚠️  All search queries exhausted, no property page found`);
  return null;
}

/**
 * Build Redfin URL from address (DEPRECATED - kept for backwards compatibility)
 */
function buildRedfinUrl(address: string): string[] {
  const parsed = parseAddress(address);
  if (!parsed) return [];
  
  const { streetNum, streetName, city, state, zip } = parsed;
  const urlSafeStreet = streetName.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const urlSafeCity = city.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  
  // Try multiple Redfin URL patterns (similar to tryDirectUrlConstruction)
  return [
    `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-${zip}/home/`,
    `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-N-${zip}/home/`,
    `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-W-${zip}/home/`,
    `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-E-${zip}/home/`,
    `https://www.redfin.com/${state}/${urlSafeCity}/${streetNum}-${urlSafeStreet}-S-${zip}/home/`,
  ];
}

/**
 * Build UtahRealEstate URL from address
 */
function buildUtahRealEstateUrl(address: string): string[] {
  const parsed = parseAddress(address);
  if (!parsed) return [];
  
  const { streetNum, streetName, city, state, zip } = parsed;
  const urlSafeStreet = streetName.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const urlSafeCity = city.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const urlSafeState = state.toLowerCase();
  
  // Try multiple UtahRealEstate URL patterns
  return [
    `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
    `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet.toUpperCase()}-${urlSafeCity}-${urlSafeState.toUpperCase()}-${zip}/`,
    `https://www.utahrealestate.com/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${zip}/`,
    `https://www.utahrealestate.com/${streetNum}-W-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
    `https://www.utahrealestate.com/${streetNum}-N-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
    `https://www.utahrealestate.com/${streetNum}-E-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
    `https://www.utahrealestate.com/${streetNum}-S-${urlSafeStreet}-${urlSafeCity}-${urlSafeState}-${zip}/`,
  ];
}

/**
 * Build Zillow URL patterns for a given address
 * Zillow uses format: /homedetails/{streetNum}-{streetName}-{city}-{state}-{zip}/
 */
function buildZillowUrl(address: string): string[] {
  const parsed = parseAddress(address);
  if (!parsed) return [];
  
  const { streetNum, streetName, city, state, zip } = parsed;
  const urlPatterns: string[] = [];
  
  // Clean up street name for URL (remove spaces, periods, etc.)
  const urlSafeStreet = streetName.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const urlSafeCity = city.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const stateSlug = state.toUpperCase();
  
  // Zillow Pattern: /homedetails/{streetNum}-{streetName}-{city}-{state}-{zip}/
  // Try multiple URL patterns (similar to tryDirectUrlConstruction)
  return [
    `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-${urlSafeCity}-${stateSlug}-${zip}/`,
    `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-N-${urlSafeCity}-${stateSlug}-${zip}/`,
    `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-W-${urlSafeCity}-${stateSlug}-${zip}/`,
    `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-E-${urlSafeCity}-${stateSlug}-${zip}/`,
    `https://www.zillow.com/homedetails/${streetNum}-${urlSafeStreet}-S-${urlSafeCity}-${stateSlug}-${zip}/`
  ];
}

/**
 * Check which critical fields are missing from listing data
 */
function getMissingCriticalFields(listing: any): string[] {
  const criticalFields = ENRICHMENT_CONFIG.criticalFields;
  const missing: string[] = [];
  
  console.log('🔍 Checking for missing critical fields:', {
    criticalFields,
    currentValues: {
      hoa: listing.hoa,
      yearBuilt: listing.yearBuilt,
      propertyTax: listing.propertyTax,
      lotSqft: listing.lotSqft,
      propertyType: listing.propertyType
    }
  });
  
  for (const field of criticalFields) {
    const value = listing[field];
    
    if (field === 'hoa') {
      if (value === null || value === undefined) {
        missing.push(field);
        console.log(`  ❌ ${field}: missing (value=${value})`);
      } else {
        console.log(`  ✅ ${field}: present (value=${value})`);
      }
    } else {
      if (value === null || value === undefined) {
        missing.push(field);
        console.log(`  ❌ ${field}: missing (value=${value})`);
      } else {
        console.log(`  ✅ ${field}: present (value=${value})`);
      }
    }
  }
  
  console.log(`📊 Missing critical fields: ${missing.length}/${criticalFields.length}`, missing);
  return missing;
}

/**
 * 🆕 NEW FUNCTION: Check if enrichment should be triggered
 * HIGH-PRIORITY FIELDS (hoa, propertyTax) ALWAYS trigger enrichment
 */
function shouldTriggerEnrichment(listing: any): boolean {
  const highPriorityFields = ENRICHMENT_CONFIG.highPriorityFields;
  
  // Check if ANY high-priority field is missing
  for (const field of highPriorityFields) {
    const value = listing[field];
    if (value === null || value === undefined) {
      console.log(`🔴 HIGH-PRIORITY FIELD MISSING: ${field} - TRIGGERING ENRICHMENT`);
      return true;
    }
  }
  
  // If high-priority fields are present, use normal threshold
  const missingFields = getMissingCriticalFields(listing);
  const shouldEnrich = missingFields.length >= ENRICHMENT_CONFIG.minMissingFieldsToTrigger;
  
  console.log(`Enrichment decision: ${shouldEnrich ? 'YES' : 'NO'} (${missingFields.length} missing fields)`);
  return shouldEnrich;
}

/**
 * Validate HOA value and assign confidence score
 * Returns whether HOA is valid and a confidence score (0-1)
 */
function validateHOA(
  hoa: number | null | undefined, 
  sourceName: string
): { valid: boolean; confidence: number; reason?: string } {
  
  // Null/undefined HOA is invalid (not found)
  if (hoa === null || hoa === undefined) {
    return { valid: false, confidence: 0, reason: 'HOA value is null/undefined' };
  }
  
  // HOA of $0 is VALID and common (no HOA fee)
  if (hoa === 0) {
    console.log(`[HOA Validation] ✓ Valid: $0/mo HOA (no fee) from ${sourceName}`);
    return { valid: true, confidence: 0.95, reason: 'No HOA fee (valid)' };
  }
  
  // Typical HOA range for Utah properties: $10 - $1000/month
  // Values outside this range are suspicious
  if (hoa < 5) {
    console.log(`[HOA Validation] ⚠️  Suspicious: $${hoa}/mo is unusually low for ${sourceName}`);
    return { valid: false, confidence: 0.3, reason: 'HOA value suspiciously low (< $5)' };
  }
  
  if (hoa > 1000) {
    console.log(`[HOA Validation] ⚠️  Suspicious: $${hoa}/mo is unusually high for ${sourceName}`);
    return { valid: false, confidence: 0.3, reason: 'HOA value suspiciously high (> $1000)' };
  }
  
  // Valid HOA in normal range
  // Confidence based on source reliability
  const sourceConfidence = getSourceHOAReliability(sourceName);
  
  console.log(`[HOA Validation] ✓ Valid: $${hoa}/mo from ${sourceName} (confidence: ${sourceConfidence})`);
  return { 
    valid: true, 
    confidence: sourceConfidence, 
    reason: `Valid HOA in normal range from ${sourceName}` 
  };
}

/**
 * Get HOA reliability score for a given source
 */
function getSourceHOAReliability(sourceName: string): number {
  const source = ENRICHMENT_CONFIG.sources.find(s => s.name === sourceName);
  
  if (!source || !source.hoaReliability) return 0.5; // Unknown source, medium confidence
  
  switch (source.hoaReliability) {
    case 'high':
      return 0.95;
    case 'medium':
      return 0.75;
    default:
      return 0.70;
  }
}

/**
 * Cross-source data enrichment function
 * Fetches missing critical fields from high-quality sources
 */
async function enrichPropertyData(
  initialListing: ListingData,
  initialAddress: string
): Promise<{ enrichedListing: ListingData; enrichmentLog: Array<{ source: string; url: string; fieldsFound: string[] }> }> {
  console.log('');
  console.log('============================================================');
  console.log('CROSS-SOURCE ENRICHMENT CALLED');
  console.log('============================================================');
  console.log('📍 Address:', initialAddress);
  console.log('📋 Initial listing data:', {
    price: initialListing.price,
    beds: initialListing.beds,
    baths: initialListing.baths,
    sqft: initialListing.sqft,
    hoa: initialListing.hoa,
    yearBuilt: initialListing.yearBuilt,
    propertyTax: initialListing.propertyTax,
    lotSqft: initialListing.lotSqft,
    propertyType: initialListing.propertyType
  });
  
  // Check which fields are missing
  const missingFields = getMissingCriticalFields(initialListing);
  console.log(`Initial data missing fields: ${missingFields.join(', ') || 'none'}`);
  
  // 🆕 Use new high-priority field logic
  if (!shouldTriggerEnrichment(initialListing)) {
    console.log(`Skipping enrichment: No high-priority fields missing and only ${missingFields.length} missing field(s)`);
    return {
      enrichedListing: initialListing,
      enrichmentLog: []
    };
  }
  
  // Start with initial data
  const enrichedListing: ListingData = { ...initialListing };
  const enrichmentLog: Array<{ source: string; url: string; fieldsFound: string[] }> = [];
  let sourcesAttempted = 0;
  
  // Try each source in priority order
  for (const source of ENRICHMENT_CONFIG.sources) {
    if (sourcesAttempted >= ENRICHMENT_CONFIG.maxEnrichmentAttempts) {
      console.log(`Reached maximum enrichment attempts (${ENRICHMENT_CONFIG.maxEnrichmentAttempts})`);
      break;
    }
    
    console.log(`[${sourcesAttempted + 1}/${ENRICHMENT_CONFIG.maxEnrichmentAttempts}] Trying enrichment source: ${source.name} (${source.description})`);
    sourcesAttempted++;
    
    // Use improved multi-query Google Search to find the actual property URL
    console.log(`🔍 Searching Google for ${source.name} listing...`);
    
    let propertyUrl: string | null = null;
    
    // Parse address to extract components for better queries
    const parsed = parseAddress(initialAddress);
    if (!parsed) {
      console.log(`   ✗ Could not parse address: ${initialAddress}`);
      continue;
    }
    
    const { streetNum, streetName, city, state, zip } = parsed;
    
    // Build search queries based on source
    let searchQueries: string[] = [];
    
    if (source.name === 'redfin') {
      searchQueries = [
        // Most specific - full address with path hint
        `"${streetNum} ${streetName}" "${zip}" site:redfin.com/${state}/${city}`,
        // Street name and zip with home path
        `"${streetName}" "${zip}" site:redfin.com/home`,
        // Street number and key words from street name
        `${streetNum} ${streetName.split(' ')[0]} ${city} site:redfin.com/${state}`,
        // Simple address with site
        `${initialAddress} site:redfin.com`,
        // Just street and city for broader match
        `"${streetName}" ${city} ${state} site:redfin.com`
      ];
    } else if (source.name === 'utahrealestate') {
      searchQueries = [
        // Most specific with pid pattern
        `"${streetNum} ${streetName}" "${zip}" site:utahrealestate.com/pid`,
        // Full address
        `${initialAddress} site:utahrealestate.com`,
        // Street name and ZIP
        `"${streetName}" "${zip}" site:utahrealestate.com`,
        // City and street
        `"${streetName}" ${city} site:utahrealestate.com`
      ];
    } else if (source.name === 'zillow') {
      searchQueries = [
        // Most specific - full address with homedetails pattern
        `"${streetNum} ${streetName}" "${city}" "${state}" "${zip}" site:zillow.com/homedetails`,
        // Full address
        `${initialAddress} site:zillow.com`,
        // Street name and ZIP
        `"${streetName}" "${zip}" site:zillow.com`,
        // City and street
        `"${streetName}" ${city} ${state} site:zillow.com`
      ];
    }
    
    // BAD URL PATTERNS - aggregate pages
    const badPatterns = [
      /\/zipcode\//i,
      /\/city\//i,
      /\/roster\//i,
      /\/office\//i,
      /\/agent\//i,
      /\/search/i,
      /\/browse/i,
      /\/find/i,
      /listings\.report/i
    ];
    
    // Try each query variation
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      console.log(`   [${i + 1}/${searchQueries.length}] Query: "${searchQuery}"`);
      
      try {
        const searchResults = await googleSearch(searchQuery);
        
        if (!searchResults || searchResults.length === 0) {
          console.log(`   ✗ No results found`);
          continue;
        }
        
        console.log(`   Found ${searchResults.length} results, filtering...`);
        
        // Filter results to find the best property page URL
        for (const item of searchResults) {
          const url = item.link;
          
          // Skip if URL matches any bad pattern
          if (badPatterns.some(pattern => pattern.test(url))) {
            console.log(`   ✗ Skipping (aggregate): ${url}`);
            continue;
          }
          
          // For Redfin: Look for the pattern /home/[propertyId]
          if (source.name === 'redfin') {
            if (url.includes('/home/') && /\/\d+\/?$/.test(url)) {
              console.log(`   ✓ Found property page: ${url}`);
              propertyUrl = url;
              break;
            }
          }
          
          // For UtahRealEstate: Look for URLs with address patterns
          if (source.name === 'utahrealestate') {
            const hasStreetNum = url.toLowerCase().includes(streetNum);
            const hasZip = url.includes(zip);
            const hasPropertyPattern = /pid\.\d+|mls.*\d+|\d{7}/i.test(url);
            
            if ((hasStreetNum || hasZip) && hasPropertyPattern) {
              console.log(`   ✓ Found property page: ${url}`);
              propertyUrl = url;
              break;
            }
          }
          
          // For Zillow: Look for the pattern /homedetails/
          if (source.name === 'zillow') {
            if (url.includes('/homedetails/') && url.includes(`/${zip}`)) {
              console.log(`   ✓ Found property page: ${url}`);
              propertyUrl = url;
              break;
            }
          }
        }
        
        if (propertyUrl) {
          // Found a URL, stop trying queries
          break;
        }
        
        console.log(`   No property page in these results, trying next query...`);
        
      } catch (error) {
        console.log(`   ✗ Search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        continue;
      }
    }
    
    if (!propertyUrl) {
      console.log(`   ⚠️  All search queries exhausted, no property page found`);
      console.log(`✗ Could not find ${source.name} URL via Google Search`);
      continue;
    }
    
    // Now fetch and scrape the actual property page
    console.log(`📥 Fetching property page from ${source.name}...`);
    
    try {
      const fetchResponse = await fetch(propertyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000), // 8 second timeout
      });
      
      if (!fetchResponse.ok) {
        console.log(`✗ HTTP ${fetchResponse.status} - page may be blocking requests`);
        continue;
      }
      
      const htmlContent = await fetchResponse.text();
      const plainText = htmlToPlainText(htmlContent);
      
      if (plainText && plainText.length >= 100) {
        console.log(`✓ Fetched ${plainText.length} characters from ${source.name}`);
        
        // Extract property data using existing extraction logic
        console.log(`🤖 Extracting property data from ${source.name} page...`);
        
        const extractedListing = await extractListingWithOpenAISinglePage(
          propertyUrl,
          plainText,
          `enrichment_${source.name}`,
          initialAddress
        );
        
        console.log(`📊 Extracted data from ${source.name}:`, {
          hoa: extractedListing.hoa,
          yearBuilt: extractedListing.yearBuilt,
          propertyTax: extractedListing.propertyTax,
          lotSqft: extractedListing.lotSqft
        });
        
        // Apply extracted data to enriched listing (only missing fields)
        const fieldsFound: string[] = [];
        
        // Check each critical field and merge if missing in enrichedListing
        const hoaCandidates: Array<{ value: number; source: string; confidence: number }> = [];
        
        for (const field of ENRICHMENT_CONFIG.criticalFields) {
          const currentValue = enrichedListing[field as keyof ListingData];
          const extractedValue = extractedListing[field as keyof ListingData];
          
          // Only merge if current value is missing and extracted value exists
          if ((currentValue === null || currentValue === undefined) && extractedValue !== null && extractedValue !== undefined) {
            if (field === 'hoa') {
              // 🆕 HOA: Validate before accepting
              if (typeof extractedValue === 'number') {
                const validation = validateHOA(extractedValue, source.name);
                
                if (validation.valid) {
                  // Track this HOA candidate with confidence score
                  hoaCandidates.push({
                    value: extractedValue,
                    source: source.name,
                    confidence: validation.confidence
                  });
                  
                  // For now, accept the first valid HOA we find
                  // (Later we'll implement smart merging if multiple sources provide HOA)
                  if (enrichedListing.hoa === null || enrichedListing.hoa === undefined) {
                    enrichedListing.hoa = extractedValue;
                    fieldsFound.push(field);
                    console.log(`✅ Accepted HOA: $${extractedValue}/mo from ${source.name} (confidence: ${validation.confidence})`);
                  }
                } else {
                  console.log(`⚠️  Rejected HOA: $${extractedValue}/mo from ${source.name} - ${validation.reason}`);
                }
              }
            } else if (field === 'propertyTax') {
              // Property tax: Convert annual to monthly if needed (extractListingWithOpenAISinglePage returns annual)
              if (typeof extractedValue === 'number' && extractedValue > 0) {
                enrichedListing.propertyTax = extractedValue; // Already annual from extraction
                fieldsFound.push(field);
              }
            } else {
              // Other fields: merge if not null/undefined and not 0 (0 usually means missing data for these fields)
              if (typeof extractedValue === 'number' && extractedValue !== 0) {
                (enrichedListing as any)[field] = extractedValue;
                fieldsFound.push(field);
              } else if (typeof extractedValue !== 'number') {
                // Non-number values (shouldn't happen for these fields, but handle it)
                (enrichedListing as any)[field] = extractedValue;
                fieldsFound.push(field);
              }
            }
          }
        }
        
        if (fieldsFound.length > 0) {
          console.log(`✅ Successfully enriched ${fieldsFound.length} field(s): ${fieldsFound.join(', ')}`);
          enrichmentLog.push({
            source: source.name,
            url: propertyUrl,
            fieldsFound
          });
        } else {
          console.log(`⚠️  Page visited but no new data found for missing fields`);
        }
        
        // Check if we've found everything we need
        const stillMissing = getMissingCriticalFields(enrichedListing);
        if (stillMissing.length === 0) {
          console.log(`✅ All critical fields now populated - stopping enrichment`);
          break;
        }
        
      } else {
        console.log(`✗ Content too short (${plainText?.length || 0} chars)`);
      }
      
    } catch (error) {
      console.log(`✗ Error processing ${source.name}:`, error instanceof Error ? error.message : 'Unknown error');
      continue;
    }
  }
  
  // Check final state of missing fields
  const finalMissingFields = getMissingCriticalFields(enrichedListing);
  console.log(`\nEnrichment complete. Fields still missing: ${finalMissingFields.join(', ') || 'none'}`);
  
  // 🆕 If HOA is STILL missing after all direct sources, try Google fallback
  if (finalMissingFields.includes('hoa')) {
    console.log(`🔍 HOA still missing after ${sourcesAttempted} enrichment attempts - trying Google fallback...`);
    
    try {
      const googleHOA = await findHOAViaGoogleFallback(initialAddress);
      
      if (googleHOA !== null) {
        enrichedListing.hoa = googleHOA;
        enrichmentLog.push({
          source: 'google_hoa_fallback',
          url: 'Google Search Results',
          fieldsFound: ['hoa']
        });
        console.log(`✅ Google fallback SUCCESS: Found HOA = $${googleHOA}/mo`);
      } else {
        console.log(`⚠️  Google fallback FAILED: Could not find HOA via Google search`);
      }
    } catch (error) {
      console.error(`❌ Google HOA fallback error:`, error);
    }
  }
  
  console.log(`Enrichment log: ${enrichmentLog.length} source(s) provided data`);
  console.log(`${'='.repeat(60)}\n`);
  
  return {
    enrichedListing,
    enrichmentLog
  };
}

/**
 * 🆕 Google Search fallback specifically for HOA data
 * Used when all direct property sources fail to find HOA
 */
async function findHOAViaGoogleFallback(address: string): Promise<number | null> {
  console.log('');
  console.log('============================================================');
  console.log('HOA GOOGLE FALLBACK SEARCH');
  console.log('============================================================');
  console.log(`🔍 Searching Google specifically for HOA info: ${address}`);
  
  const searchQueries = [
    `"${address}" HOA fee monthly`,
    `"${address}" homeowner association fee`,
    `"${address}" HOA dues`,
    `${address} HOA monthly cost`,
  ];
  
  for (let i = 0; i < searchQueries.length; i++) {
    const query = searchQueries[i];
    console.log(`[${i + 1}/${searchQueries.length}] Trying query: "${query}"`);
    
    try {
      const searchResults = await googleSearch(query);
      
      if (!searchResults || searchResults.length === 0) {
        console.log(`   ✗ No results found`);
        continue;
      }
      
      console.log(`   Found ${searchResults.length} results, analyzing snippets...`);
      
      // HOA patterns to look for in snippets
      const hoaPatterns = [
        // "$20/month HOA", "$20/mo HOA", "$20 monthly HOA"
        /\$(\d+)(?:\/month|\/mo|\s+monthly)\s+HOA/i,
        // "HOA: $20", "HOA fee: $20"
        /HOA(?:\s+fee)?:\s*\$(\d+)/i,
        // "monthly HOA of $20", "HOA dues of $20"
        /(?:monthly\s+)?HOA(?:\s+dues)?\s+of\s+\$(\d+)/i,
        // "$20 HOA fee", "$20 association fee"
        /\$(\d+)\s+(?:HOA|association)\s+fee/i,
      ];
      
      for (const result of searchResults) {
        const snippet = result.snippet || '';
        const title = result.title || '';
        const textToSearch = `${title} ${snippet}`.toLowerCase();
        
        console.log(`   Analyzing: "${snippet.substring(0, 100)}..."`);
        
        // Try each pattern
        for (const pattern of hoaPatterns) {
          const match = textToSearch.match(pattern);
          if (match && match[1]) {
            const hoaAmount = parseInt(match[1], 10);
            
            // Validate the found HOA
            const validation = validateHOA(hoaAmount, 'google_fallback');
            
            if (validation.valid) {
              console.log(`✅ [HOA Fallback] Found valid HOA via Google: $${hoaAmount}/mo`);
              console.log(`   Source: ${result.link}`);
              console.log(`   Context: "${match[0]}"`);
              return hoaAmount;
            } else {
              console.log(`⚠️  [HOA Fallback] Found HOA but failed validation: $${hoaAmount}/mo - ${validation.reason}`);
            }
          }
        }
      }
      
      console.log(`   No valid HOA patterns found in results`);
      
    } catch (error) {
      console.error(`   ✗ Search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }
  
  console.log('⚠️  [HOA Fallback] All Google searches exhausted - HOA not found');
  console.log('============================================================\n');
  return null;
}

/**
 * Get listing data using Google Search (SIMPLIFIED VERSION)
 */
async function getListingDataFromGoogleSearch(url?: string, mlsNumber?: string, address?: string): Promise<{ listing: ListingData; ingestion: IngestResult }> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log(`\n=== GOOGLE SEARCH FALLBACK START ===`);
  console.log(`Input: url=${url}, mlsNumber=${mlsNumber}, address=${address}`);

  // Build SIMPLE search queries - no complex operators
  let searchQueries: string[] = [];
  
  if (address) {
    console.log(`Building queries for address: ${address}`);
    searchQueries = [
      // Very simple queries without site restrictions
      address,
      `${address} property listing`,
      `${address} for sale`,
      // Then try specific sites
      `${address} site:utahrealestate.com`,
      `${address} site:redfin.com`,
      `${address} site:homes.com`,
      `${address} site:zillow.com`,
    ];
  } else if (mlsNumber) {
    console.log(`Building queries for MLS: ${mlsNumber}`);
    searchQueries = [
      `MLS ${mlsNumber}`,
      `${mlsNumber} MLS listing`,
      `MLS ${mlsNumber} site:utahrealestate.com`,
      `MLS ${mlsNumber} site:redfin.com`,
    ];
  } else if (url) {
    const addressFromUrl = extractAddressFromUrl(url);
    if (addressFromUrl) {
      console.log(`Extracted address from URL: ${addressFromUrl}`);
      searchQueries = [
        addressFromUrl,
        `${addressFromUrl} property listing`,
        `${addressFromUrl} site:utahrealestate.com`,
        `${addressFromUrl} site:redfin.com`,
      ];
    } else {
      console.log(`Could not extract address from URL, searching URL directly`);
      searchQueries = [url];
    }
  } else {
    throw new Error('No search query available: need URL, address, or MLS number');
  }

  console.log(`Will try ${searchQueries.length} search queries...`);

  // Try each query and collect ALL results
  let allSearchResults: GoogleSearchResult[] = [];
  
  for (let i = 0; i < searchQueries.length; i++) {
    const query = searchQueries[i];
    try {
      console.log(`[${i + 1}/${searchQueries.length}] Trying query: "${query}"`);
      const results = await googleSearch(query);
      console.log(`  → Got ${results.length} results`);
      
      // Add unique results
      for (const result of results) {
        if (!allSearchResults.some(r => r.link === result.link)) {
          allSearchResults.push(result);
        }
      }
      
      // If we have enough results, stop early
      if (allSearchResults.length >= 10) {
        console.log(`Collected ${allSearchResults.length} total results, stopping early`);
        break;
      }
    } catch (error) {
      console.log(`  ✗ Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }

  if (allSearchResults.length === 0) {
    console.log(`=== GOOGLE SEARCH FAILED - Zero results from all queries ===\n`);
    throw new Error(`No search results found. Tried queries: ${searchQueries.join(', ')}`);
  }

  console.log(`Total search results collected: ${allSearchResults.length}`);

  // Filter out bad sources (symphonyhomes.com never has price data)
  const filteredResults = allSearchResults.filter(result => 
    !result.link.includes('symphonyhomes.com')
  );
  console.log(`After filtering out symphonyhomes.com: ${filteredResults.length} results`);

  // Prioritize known good sources (redfin, utahrealestate, zillow, realtor)
  const priorityResults = filteredResults.filter(result => {
    const link = result.link.toLowerCase();
    return link.includes('redfin.com') || 
           link.includes('utahrealestate.com') || 
           link.includes('zillow.com') || 
           link.includes('realtor.com');
  });
  
  const otherResults = filteredResults.filter(result => {
    const link = result.link.toLowerCase();
    return !link.includes('redfin.com') && 
           !link.includes('utahrealestate.com') && 
           !link.includes('zillow.com') && 
           !link.includes('realtor.com');
  });

  // Combine: priority URLs first, then others, limit to 10 total
  const urlsToTry = [...priorityResults, ...otherResults].slice(0, 10);
  console.log(`Prioritized ${priorityResults.length} good sources, ${otherResults.length} other sources`);
  console.log(`Attempting to fetch top ${urlsToTry.length} URLs (prioritizing good sources first)...`);

  for (let i = 0; i < urlsToTry.length; i++) {
    const result = urlsToTry[i];
    try {
      console.log(`[${i + 1}/${urlsToTry.length}] Fetching: ${result.link}`);
      
      const fetchResponse = await fetch(result.link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });

      if (fetchResponse.ok) {
        const htmlContent = await fetchResponse.text();
        const plainText = htmlToPlainText(htmlContent);
        
        if (plainText && plainText.length >= 100) {
          console.log(`  → Fetched ${plainText.length} chars, attempting extraction...`);
          
          const listing = await extractListingWithOpenAISinglePage(
            result.link,
            plainText,
            'google_search_fallback',
            address
          );

          // Stop immediately when we find price data (complete property data)
          if (listing.price && listing.price > 0) {
            console.log(`  ✓ Successfully extracted COMPLETE data from ${result.link} (has price: $${listing.price.toLocaleString()})`);
            console.log(`=== GOOGLE SEARCH SUCCESS ===\n`);
            
            return {
              listing,
              ingestion: {
                raw_text: plainText.substring(0, 5000),
                source: 'google_search_fallback',
                notes: `Found via Google Search and extracted from ${result.link}`,
                searchProviderUsed: 'google',
                searchQueryUsed: searchQueries[0],
                numSearchResultsUsed: allSearchResults.length
              }
            };
          } else {
            console.log(`  ✗ Extraction failed - missing price data (price: ${listing.price}), continuing to next URL...`);
          }
        } else {
          console.log(`  ✗ Content too short`);
        }
      } else {
        console.log(`  ✗ HTTP ${fetchResponse.status}`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
      continue;
    }
  }

  console.log(`=== GOOGLE SEARCH FAILED - Could not extract data from any result ===\n`);
  throw new Error('Could not extract property data from any search result');
}

/**
 * Main function: Get listing data from URL
 * IMPROVED VERSION with proper fallback chain
 */
async function getListingDataFromUrl(url: string): Promise<{ listing: ListingData; ingestion: IngestResult }> {
  console.log(`\n======================================`);
  console.log(`PROCESSING URL: ${url}`);
  console.log(`======================================\n`);

  // STEP 1: Try direct fetch
  try {
    console.log(`STEP 1: Attempting direct fetch...`);
    const ingestion = await ingestListingText(url);
    const targetAddress = extractAddressFromUrl(url);
    const listing = await extractListingWithOpenAI(url, ingestion.raw_text, ingestion.source, targetAddress);
    
    // Check if we got critical fields
    if (!hasCriticalMissingFields(listing)) {
      console.log(`✓ Direct fetch SUCCESS - got all critical fields`);
      return { listing, ingestion };
    } else {
      console.log(`✗ Direct fetch got partial data, missing critical fields`);
    }
  } catch (error) {
    console.log(`✗ Direct fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // STEP 2: Extract address and try direct URL construction BEFORE Google Search
  console.log(`\nSTEP 2: Attempting direct URL construction before Google Search fallback...`);
  const addressFromUrl = extractAddressFromUrl(url);
  if (addressFromUrl) {
    console.log(`Extracted address from URL: ${addressFromUrl}`);
    console.log(`Trying direct URL construction with address: ${addressFromUrl}`);
    const directUrlResult = await tryDirectUrlConstruction(addressFromUrl);
    if (directUrlResult) {
      console.log(`✓ Direct URL construction SUCCESS - returning result`);
      return directUrlResult;
    } else {
      console.log(`✗ Direct URL construction failed - will fall back to Google Search`);
    }
  } else {
    console.log(`✗ Could not extract address from URL for direct URL construction`);
    console.log(`Will attempt Google Search as last resort`);
  }

  // STEP 3: Fall back to Google Search ONLY if direct URL construction failed
  console.log(`\nSTEP 3: All direct methods failed - falling back to Google Search as last resort...`);
  return await getListingDataFromGoogleSearch(url, undefined, addressFromUrl || undefined);
}

/**
 * Wrapper for backward compatibility
 */
async function extractListingWithOpenAI(url: string, rawText: string, source: string, targetAddress?: string | null): Promise<ListingData> {
  return extractListingWithOpenAISinglePage(url, rawText, source, targetAddress);
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

    let searchResult: { listing: ListingData; ingestion: IngestResult };
    
    if (url) {
      // For URLs: Use improved fallback chain
      console.log(`\n${'='.repeat(60)}`);
      console.log(`NEW REQUEST: URL`);
      console.log(`${'='.repeat(60)}`);
      searchResult = await getListingDataFromUrl(url);
    } else if (address) {
      // For addresses: Try direct URL construction first, then Google Search
      console.log(`\n${'='.repeat(60)}`);
      console.log(`NEW REQUEST: ADDRESS`);
      console.log(`Address: ${address}`);
      console.log(`${'='.repeat(60)}`);
      
      // PRIORITY 1: Try direct URL construction
      console.log(`\nPRIORITY 1: Trying direct URL construction...`);
      const directUrlResult = await tryDirectUrlConstruction(address);
      
      if (directUrlResult) {
        console.log(`✓ Direct URL construction SUCCESS`);
        searchResult = directUrlResult;
      } else {
        // PRIORITY 2: Fall back to Google Search
        console.log(`✗ Direct URL construction failed`);
        console.log(`\nPRIORITY 2: Falling back to Google Search...`);
        searchResult = await getListingDataFromGoogleSearch(undefined, undefined, address);
      }
    } else {
      throw new Error('No URL or address provided');
    }

    // STEP: Cross-source enrichment (fill in missing critical fields)
    console.log('🔵 CHECKPOINT: About to start enrichment section');
    console.log('🔵 searchResult exists:', !!searchResult);
    console.log('🔵 searchResult.listing exists:', !!searchResult?.listing);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CROSS-SOURCE ENRICHMENT - STARTING`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📋 BEFORE ENRICHMENT - Current listing state:`, {
      address: searchResult.listing.address,
      price: searchResult.listing.price,
      hoa: searchResult.listing.hoa,
      yearBuilt: searchResult.listing.yearBuilt,
      propertyTax: searchResult.listing.propertyTax,
      lotSqft: searchResult.listing.lotSqft
    });
    console.log(`🔍 About to call enrichPropertyData()...`);
    
    let enrichmentResult;
    try {
      console.log(`✅ enrichPropertyData() call initiated`);
      enrichmentResult = await enrichPropertyData(
        searchResult.listing,
        searchResult.listing.address
      );
      console.log(`✅ enrichPropertyData() call completed successfully`);
      
      // Comprehensive debug logging
      console.log('🔍 ENRICHMENT DEBUG:', {
        wasCalled: true,
        hadMissingFields: enrichmentResult.enrichmentLog.length > 0 ? 'unknown' : 'check logs above',
        missingFieldsList: 'check logs above',
        sourcesAttempted: enrichmentResult.enrichmentLog.length,
        fieldsFound: enrichmentResult.enrichmentLog.flatMap(entry => entry.fieldsFound),
        finalListing: {
          hoa: enrichmentResult.enrichedListing.hoa,
          yearBuilt: enrichmentResult.enrichedListing.yearBuilt,
          propertyTax: enrichmentResult.enrichedListing.propertyTax,
          lotSqft: enrichmentResult.enrichedListing.lotSqft
        }
      });
      
      // Update searchResult with enriched data
      searchResult.listing = enrichmentResult.enrichedListing;
      
      // Log enrichment results
      if (enrichmentResult.enrichmentLog.length > 0) {
        console.log(`✅ Enrichment successful: ${enrichmentResult.enrichmentLog.length} source(s) provided data`);
        for (const logEntry of enrichmentResult.enrichmentLog) {
          console.log(`  - ${logEntry.source}: Found ${logEntry.fieldsFound.join(', ')}`);
        }
      } else {
        console.log(`⚠️  Enrichment skipped or no additional data found`);
      }
      
      console.log(`📋 AFTER ENRICHMENT - Updated listing state:`, {
        address: searchResult.listing.address,
        price: searchResult.listing.price,
        hoa: searchResult.listing.hoa,
        yearBuilt: searchResult.listing.yearBuilt,
        propertyTax: searchResult.listing.propertyTax,
        lotSqft: searchResult.listing.lotSqft
      });
      
    } catch (enrichmentError) {
      console.error(`\n❌❌❌ ENRICHMENT ERROR - enrichPropertyData() CRASHED ❌❌❌`);
      console.error(`Error type: ${enrichmentError instanceof Error ? enrichmentError.constructor.name : typeof enrichmentError}`);
      console.error(`Error message: ${enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError)}`);
      console.error(`Error stack:`, enrichmentError instanceof Error ? enrichmentError.stack : 'No stack trace available');
      console.error(`Full error object:`, enrichmentError);
      console.error(`\n⚠️  Continuing with original (non-enriched) listing data due to enrichment failure`);
      
      // Continue with original data if enrichment fails
      // searchResult.listing remains unchanged (already has original data)
      console.log(`📋 Using original listing data (enrichment failed):`, {
        address: searchResult.listing.address,
        price: searchResult.listing.price,
        hoa: searchResult.listing.hoa,
        yearBuilt: searchResult.listing.yearBuilt,
        propertyTax: searchResult.listing.propertyTax,
        lotSqft: searchResult.listing.lotSqft
      });
    }
    
    console.log(`${'='.repeat(60)}`);
    console.log(`CROSS-SOURCE ENRICHMENT - COMPLETE`);
    console.log(`${'='.repeat(60)}\n`);

    // Try property tax lookup if still missing (legacy fallback)
    if (!searchResult.listing.propertyTax && searchResult.listing.address && searchResult.listing.price) {
      const lookedUpTax = await lookupPropertyTax(searchResult.listing.address, searchResult.listing.price);
      if (lookedUpTax !== null) {
        searchResult.listing.propertyTax = lookedUpTax;
      }
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`REQUEST COMPLETE - SUCCESS`);
    console.log(`${'='.repeat(60)}\n`);

    return response.status(200).json({
      success: true,
      listing: searchResult.listing,
      ingestion: searchResult.ingestion
    });

  } catch (error) {
    console.error('\n❌ REQUEST FAILED:', error);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`REQUEST COMPLETE - ERROR`);
    console.log(`${'='.repeat(60)}\n`);
    
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false
    });
  }
}
