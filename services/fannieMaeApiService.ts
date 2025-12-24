/**
 * Fannie Mae API Service
 * 
 * Service for interacting with Fannie Mae's AMI Lookup and HomeReady Evaluation API
 * Documentation: https://singlefamily.fanniemae.com/applications-technology/application-programming-interfaces-apis/ami-lookup-homeready-evaluation-api
 * 
 * Authentication:
 * Uses API key directly in x-public-access-token header
 */

const FANNIE_MAE_API_BASE_URL = 'https://api.fanniemae.com/v1';

/**
 * Get Fannie Mae API key from environment variables
 */
function getFannieMaeApiKey(): string | null {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const apiKey = import.meta.env.VITE_FANNIE_MAE_API_KEY;
    
    if (apiKey && apiKey.length > 0) {
      return apiKey;
    }
  }
  
  console.warn('Fannie Mae API: API key not found. Make sure VITE_FANNIE_MAE_API_KEY is set in environment variables.');
  return null;
}

/**
 * Check if Fannie Mae API is configured
 */
export function isFannieMaeApiConfigured(): boolean {
  return !!getFannieMaeApiKey();
}

/**
 * Get income limits by ZIP code from Fannie Mae API
 * 
 * Note: The exact endpoint structure needs to be confirmed from Fannie Mae's Developer Portal.
 * This endpoint may need adjustment based on their actual API documentation.
 * 
 * @param zipCode - 5-digit zip code
 * @returns Income limits data or null if error
 */
export async function getIncomeLimitsByZipCode(zipCode: string): Promise<any | null> {
  const apiKey = getFannieMaeApiKey();
  if (!apiKey) {
    console.error('Fannie Mae API: API key not configured');
    return null;
  }

  try {
    // TODO: Update this endpoint based on Fannie Mae's actual API documentation
    // Check the Fannie Mae Developer Portal Swagger documentation for the exact endpoint
    // Common patterns might be:
    // - /ami-lookup?zipCode={zipCode}
    // - /income-limits?zipCode={zipCode}
    // - /homeready-evaluation?zipCode={zipCode}
    // - /ami-lookup/{zipCode}
    
    const url = `${FANNIE_MAE_API_BASE_URL}/ami-lookup?zipCode=${zipCode}`;
    console.log('Fannie Mae API: Fetching income limits from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-public-access-token': apiKey,
      },
    });

    console.log('Fannie Mae API: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fannie Mae API: Error response:', errorText);
      
      if (response.status === 401) {
        console.error('Fannie Mae API: Unauthorized - API key may be invalid or expired');
      } else if (response.status === 404) {
        console.warn(`Fannie Mae API: Income limits not found for ZIP code ${zipCode}`);
      } else if (response.status === 400) {
        console.error(`Fannie Mae API: Bad Request - Invalid ZIP code format: ${zipCode}`);
      } else {
        console.error(`Fannie Mae API Error: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json();
    console.log('Fannie Mae API: Income limits data received:', JSON.stringify(data).substring(0, 500));
    return data;
  } catch (error) {
    console.error('Fannie Mae API: Error fetching income limits:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return null;
  }
}

