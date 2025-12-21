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
    return import.meta.env.VITE_HUD_API_TOKEN;
  }
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
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('HUD API: Unauthorized - Check your API token');
      } else if (response.status === 404) {
        console.warn(`HUD API: Income limits not found for entity ${entityId}`);
      } else {
        console.error(`HUD API Error: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching income limits from HUD API:', error);
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
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error('HUD API: Unauthorized - Check your API token');
      } else if (response.status === 404) {
        console.warn(`HUD API: Crosswalk data not found for ZIP ${zipCode}`);
      } else {
        console.error(`HUD API Error: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json();
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
  const crosswalk = await getZipCodeCrosswalk(zipCode);
  
  if (!crosswalk || !crosswalk.data || crosswalk.data.length === 0) {
    console.warn(`No crosswalk data found for ZIP code ${zipCode}`);
    return null;
  }

  // Use the first result (primary county for this ZIP)
  const primaryMatch = crosswalk.data[0];
  const countyFips = primaryMatch.geoid || primaryMatch.county;
  
  if (!countyFips) {
    console.warn(`No county FIPS found in crosswalk data for ZIP ${zipCode}`);
    return null;
  }

  // Get income limits for this county
  const incomeLimits = await getIncomeLimitsByEntity(countyFips, 'county');
  
  return {
    zipCode,
    county: primaryMatch.countyname || primaryMatch.county_name,
    state: primaryMatch.state || primaryMatch.state_code,
    countyFips,
    incomeLimits,
  };
}

