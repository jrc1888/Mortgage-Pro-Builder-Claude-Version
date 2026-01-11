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

    // Try property tax lookup if missing
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
