/**
 * HUD API Service
 * 
 * Service for interacting with HUD's Income Limits API
 * Documentation: https://www.huduser.gov/portal/dataset/fmr-api.html
 */

const HUD_API_BASE_URL = 'https://www.huduser.gov/hudapi/public';

/**
 * Get HUD API access token from environment variable
 */
function getHudApiToken(): string | null {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_HUD_API_TOKEN) {
    const token = import.meta.env.VITE_HUD_API_TOKEN;
    // Log in development to help debug
    if (token && token.length > 0) {
      console.log('HUD API: Token found (length:', token.length, 'chars)');
    }
    return token;
  }
  console.warn('HUD API: Token not found. Make sure VITE_HUD_API_TOKEN is set in environment variables.');
  return null;
}

/**
 * Check if HUD API is configured
 */
export function isHudApiConfigured(): boolean {
  return !!getHudApiToken();
}

/**
 * Get income limits for a specific entity (county or MSA)
 * 
 * @param entityId - HUD entity ID (county FIPS or MSA code)
 * @param entityType - 'county' or 'msa'
 * @returns Income limits data or null if error
 */
export async function getIncomeLimitsByEntity(
  entityId: string,
  entityType: 'county' | 'msa' = 'county'
): Promise<any | null> {
  const token = getHudApiToken();
  if (!token) {
    console.error('HUD API token not configured. Set VITE_HUD_API_TOKEN environment variable.');
    return null;
  }

  try {
    // HUD API endpoint formats to try:
    // 1. /il/data/{entityid}?type={type}
    // 2. /il/data?type={type}&query={entityid}
    // 3. /il/data/{entityid} (without type parameter)
    
    // Try different URL formats
    let url = `${HUD_API_BASE_URL}/il/data/${entityId}?type=${entityType}`;
    console.log('HUD API: Fetching income limits from (format 1):', url);
    
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('HUD API: Income limits response status:', response.status);

    // If 400 error, try alternative format
    if (response.status === 400) {
      console.log('HUD API: 400 error, trying alternative format...');
      
      // Try format: /il/data?type={type}&query={entityid}
      url = `${HUD_API_BASE_URL}/il/data?type=${entityType}&query=${entityId}`;
      console.log('HUD API: Trying format 2:', url);
      
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('HUD API: Format 2 response status:', response.status);
      
      // If still 400, try without type parameter
      if (response.status === 400) {
        console.log('HUD API: Still 400, trying without type parameter...');
        url = `${HUD_API_BASE_URL}/il/data/${entityId}`;
        console.log('HUD API: Trying format 3:', url);
        
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        console.log('HUD API: Format 3 response status:', response.status);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HUD API: Error response body:', errorText);
      if (response.status === 401) {
        console.error('HUD API: Unauthorized - Check your API token is correct and active');
      } else if (response.status === 404) {
        console.warn(`HUD API: Income limits not found for entity ${entityId} (type: ${entityType})`);
      } else if (response.status === 400) {
        console.error(`HUD API: Bad Request (400) - Entity ID format may be incorrect. Tried: ${entityId} as ${entityType}`);
        console.error('HUD API: Entity ID might need different format. Check HUD API documentation.');
      } else {
        console.error(`HUD API Error: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json();
    console.log('HUD API: Income limits data received:', JSON.stringify(data).substring(0, 500));
    return data;
  } catch (error) {
    console.error('Error fetching income limits from HUD API:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return null;
  }
}

/**
 * Get ZIP code crosswalk data from HUD API
 * Maps ZIP codes to counties and MSAs
 * 
 * @param zipCode - 5-digit zip code
 * @returns Crosswalk data or null if error
 */
export async function getZipCodeCrosswalk(zipCode: string): Promise<any | null> {
  const token = getHudApiToken();
  if (!token) {
    console.error('HUD API token not configured. Set VITE_HUD_API_TOKEN environment variable.');
    return null;
  }

  try {
    // HUD API endpoint: /usps?type=1&query={zipcode}
    // type=1 returns ZIP to County/State mapping
    const url = `${HUD_API_BASE_URL}/usps?type=1&query=${zipCode}`;
    console.log('HUD API: Fetching crosswalk data from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('HUD API: Crosswalk response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HUD API: Error response:', errorText);
      if (response.status === 401) {
        console.error('HUD API: Unauthorized - Check your API token is correct');
      } else if (response.status === 404) {
        console.warn(`HUD API: Crosswalk data not found for ZIP ${zipCode}`);
      } else {
        console.error(`HUD API Error: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json();
    console.log('HUD API: Crosswalk data received:', JSON.stringify(data).substring(0, 500));
    console.log('HUD API: Crosswalk data type:', typeof data);
    console.log('HUD API: Crosswalk has results?', !!data.results);
    console.log('HUD API: Crosswalk has data?', !!data.data);
    if (data.results) {
      console.log('HUD API: Results array length:', data.results.length);
    }
    return data;
  } catch (error) {
    console.error('Error fetching ZIP code crosswalk from HUD API:', error);
    return null;
  }
}

/**
 * Get income limits by ZIP code (combines crosswalk + income limits lookup)
 * 
 * @param zipCode - 5-digit zip code
 * @returns Income limits data or null if error
 */
export async function getIncomeLimitsByZipCode(zipCode: string): Promise<any | null> {
  // First, get the county/MSA for this ZIP code
  console.log('HUD API: Getting crosswalk for zip code', zipCode);
  const crosswalk = await getZipCodeCrosswalk(zipCode);
  
  console.log('HUD API: Crosswalk response:', crosswalk);
  
  if (!crosswalk) {
    console.warn(`HUD API: No crosswalk response for ZIP code ${zipCode}`);
    return null;
  }
  
  // HUD API returns results nested in data.results structure
  // Response format: { data: { results: [...] } }
  console.log('HUD API: Checking crosswalk structure...');
  console.log('HUD API: crosswalk.data exists?', !!crosswalk.data);
  console.log('HUD API: crosswalk.data.results exists?', !!(crosswalk.data && crosswalk.data.results));
  
  let resultsArray = null;
  
  // Check for nested structure: crosswalk.data.results
  if (crosswalk.data && crosswalk.data.results && Array.isArray(crosswalk.data.results)) {
    resultsArray = crosswalk.data.results;
    console.log('HUD API: Found results array in data.results, length:', resultsArray.length);
  }
  // Check for direct results: crosswalk.results
  else if (crosswalk.results && Array.isArray(crosswalk.results)) {
    resultsArray = crosswalk.results;
    console.log('HUD API: Found results array directly, length:', resultsArray.length);
  }
  // Check if data itself is the array
  else if (Array.isArray(crosswalk.data)) {
    resultsArray = crosswalk.data;
    console.log('HUD API: Found data as array, length:', resultsArray.length);
  }
  // Check if crosswalk itself is an array
  else if (Array.isArray(crosswalk)) {
    resultsArray = crosswalk;
    console.log('HUD API: Crosswalk is directly an array, length:', resultsArray.length);
  }
  
  if (!resultsArray || !Array.isArray(resultsArray) || resultsArray.length === 0) {
    console.warn(`HUD API: No results array found for ZIP code ${zipCode}`);
    console.warn('HUD API: Full crosswalk response:', JSON.stringify(crosswalk, null, 2).substring(0, 1000));
    return null;
  }
  
  console.log('HUD API: Successfully extracted results array with', resultsArray.length, 'items');

  // Use the first result (primary tract/county for this ZIP)
  const primaryMatch = resultsArray[0];
  console.log('HUD API: Primary match:', primaryMatch);
  
  // Extract geoid (census tract ID like "49035111002")
  const geoid = primaryMatch.geoid;
  
  if (!geoid || typeof geoid !== 'string') {
    console.warn(`HUD API: No geoid found in crosswalk data for ZIP ${zipCode}. Available fields:`, Object.keys(primaryMatch));
    return null;
  }
  
  // Extract county FIPS from geoid
  // Geoid format: SSCCCtttttt (State FIPS (2) + County FIPS (3) + Tract (6+))
  // For HUD API, we need the 5-digit county FIPS (state + county)
  let countyFips = '';
  let stateFips = '';
  let countyCode = '';
  
  if (geoid.length >= 5) {
    stateFips = geoid.substring(0, 2); // First 2 digits = State FIPS
    countyCode = geoid.substring(2, 5); // Next 3 digits = County FIPS
    countyFips = geoid.substring(0, 5); // Full 5 digits = State (2) + County (3)
    console.log(`HUD API: Extracted from geoid ${geoid}:`);
    console.log(`  State FIPS: ${stateFips}`);
    console.log(`  County Code: ${countyCode}`);
    console.log(`  Full County FIPS: ${countyFips}`);
  } else {
    console.warn(`HUD API: Geoid ${geoid} is too short to extract county FIPS`);
    return null;
  }

  // Try different entity ID formats for HUD API
  // Format 1: Full 5-digit FIPS (49035)
  // Format 2: Just county code (035) - might need state separately
  // Format 3: State-County format (49-035)
  
  console.log('HUD API: Trying county FIPS format:', countyFips);
  
  // Get income limits for this county - try full FIPS first
  let incomeLimits = await getIncomeLimitsByEntity(countyFips, 'county');
  
  // If that fails, try alternative formats
  if (!incomeLimits) {
    console.log('HUD API: Full FIPS failed, trying state-county format...');
    const stateCountyFormat = `${stateFips}-${countyCode}`;
    incomeLimits = await getIncomeLimitsByEntity(stateCountyFormat, 'county');
  }
  
  if (!incomeLimits) {
    console.log('HUD API: State-county format failed, trying just county code...');
    incomeLimits = await getIncomeLimitsByEntity(countyCode, 'county');
  }
  
  console.log('HUD API: Income limits response:', incomeLimits);
  
  // Extract county and state names from the primary match
  const cityName = primaryMatch.city || '';
  const stateCode = primaryMatch.state || '';
  
  // Note: The crosswalk gives us city, not county name directly
  // We'll use the city name and state for display
  // The county name could be looked up from FIPS if needed
  
  return {
    zipCode,
    county: cityName, // Using city since that's what we have
    state: stateCode,
    countyFips,
    incomeLimits,
  };
}

