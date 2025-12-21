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
    // HUD API endpoint: /il/data/{entityid}?type={type}
    // type can be: 'county' or 'msa'
    const url = `${HUD_API_BASE_URL}/il/data/${entityId}?type=${entityType}`;
    console.log('HUD API: Fetching income limits from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('HUD API: Income limits response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HUD API: Error response body:', errorText);
      if (response.status === 401) {
        console.error('HUD API: Unauthorized - Check your API token is correct and active');
      } else if (response.status === 404) {
        console.warn(`HUD API: Income limits not found for entity ${entityId} (type: ${entityType})`);
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
  
  // HUD API returns results array - extract it
  const resultsArray = crosswalk.results || crosswalk.data;
  
  if (!resultsArray || !Array.isArray(resultsArray) || resultsArray.length === 0) {
    console.warn(`HUD API: No results array found for ZIP code ${zipCode}. Response:`, crosswalk);
    return null;
  }

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
  if (geoid.length >= 5) {
    countyFips = geoid.substring(0, 5); // First 5 digits = State (2) + County (3)
    console.log(`HUD API: Extracted county FIPS ${countyFips} from geoid ${geoid}`);
  } else {
    console.warn(`HUD API: Geoid ${geoid} is too short to extract county FIPS`);
    return null;
  }

  console.log('HUD API: Using county FIPS:', countyFips);
  
  // Get income limits for this county
  const incomeLimits = await getIncomeLimitsByEntity(countyFips, 'county');
  
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

