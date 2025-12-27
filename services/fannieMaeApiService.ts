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
  // Check if API key is configured
  const apiKey = getFannieMaeApiKey();
  if (!apiKey) {
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
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      await response.json().catch(() => ({ error: 'Unknown error' }));
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fannie Mae API: Error fetching income limits:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return null;
  }
}

