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
 * Get income limits by address or ZIP code from Fannie Mae API
 * 
 * Uses a server-side proxy to avoid CORS issues.
 * The proxy endpoint is at /api/fannie-mae-ami
 * 
 * @param addressOrZip - Full address string or 5-digit zip code
 * @returns Income limits data or null if error
 */
export async function getIncomeLimitsByZipCode(addressOrZip: string): Promise<any | null> {
  // Check if API key is configured (for logging purposes)
  const apiKey = getFannieMaeApiKey();
  if (!apiKey) {
    console.error('Fannie Mae API: API key not configured');
    return null;
  }

  try {
    // Determine if input is a full address or just ZIP code
    const isZipOnly = /^\d{5}$/.test(addressOrZip.trim());
    
    // Use our server-side proxy to avoid CORS issues
    // The proxy will handle address parsing or ZIP-to-FIPS conversion
    const proxyUrl = isZipOnly 
      ? `/api/fannie-mae-ami?zipCode=${addressOrZip.trim()}`
      : `/api/fannie-mae-ami?address=${encodeURIComponent(addressOrZip.trim())}`;
    console.log('Fannie Mae API: Fetching income limits via proxy:', proxyUrl);
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Fannie Mae API: Proxy response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Fannie Mae API: Error response:', errorData);
      
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

