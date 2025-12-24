/**
 * Fannie Mae API Service
 * 
 * Service for interacting with Fannie Mae's AMI Lookup and HomeReady Evaluation API
 * Documentation: https://singlefamily.fanniemae.com/applications-technology/application-programming-interfaces-apis/ami-lookup-homeready-evaluation-api
 * 
 * Authentication:
 * 1. Use Client ID and Client Secret to get access token
 * 2. Access tokens expire after 1 hour
 * 3. Use token in x-public-access-token header
 */

const FANNIE_MAE_API_BASE_URL = 'https://api.fanniemae.com/v1';

// Cache for access token (expires after 1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Fannie Mae API credentials from environment variables
 */
function getFannieMaeCredentials(): { clientId: string; clientSecret: string } | null {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const clientId = import.meta.env.VITE_FANNIE_MAE_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_FANNIE_MAE_CLIENT_SECRET;
    
    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }
  }
  
  console.warn('Fannie Mae API: Credentials not found. Make sure VITE_FANNIE_MAE_CLIENT_ID and VITE_FANNIE_MAE_CLIENT_SECRET are set in environment variables.');
  return null;
}

/**
 * Check if Fannie Mae API is configured
 */
export function isFannieMaeApiConfigured(): boolean {
  return !!getFannieMaeCredentials();
}

/**
 * Encode credentials to Base64 format
 * Format: clientId:clientSecret
 */
function encodeCredentials(clientId: string, clientSecret: string): string {
  const credentials = `${clientId}:${clientSecret}`;
  // In browser environment, use btoa
  if (typeof btoa !== 'undefined') {
    return btoa(credentials);
  }
  // Fallback for Node.js (though this is a Vite app, so btoa should be available)
  return Buffer.from(credentials).toString('base64');
}

/**
 * Get access token from Fannie Mae API
 * Tokens expire after 1 hour (3600 seconds)
 */
async function getAccessToken(): Promise<string | null> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    console.log('Fannie Mae API: Using cached access token');
    return cachedToken.token;
  }

  const credentials = getFannieMaeCredentials();
  if (!credentials) {
    return null;
  }

  try {
    // Encode credentials to Base64
    const encodedCredentials = encodeCredentials(credentials.clientId, credentials.clientSecret);
    
    // Request access token
    // Note: The token endpoint may need to be adjusted based on Fannie Mae's actual API
    // Common patterns: /oauth2/token, /oauth/token, /token
    const tokenUrl = `${FANNIE_MAE_API_BASE_URL}/oauth2/token`;
    console.log('Fannie Mae API: Requesting access token from:', tokenUrl);
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encodedCredentials}`,
      },
      body: 'grant_type=client_credentials',
    });

    console.log('Fannie Mae API: Token response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fannie Mae API: Failed to get access token:', response.status, errorText);
      if (response.status === 401) {
        console.error('Fannie Mae API: Invalid credentials. Check your Client ID and Client Secret.');
      }
      return null;
    }

    const data = await response.json();
    
    if (!data.access_token) {
      console.error('Fannie Mae API: No access token in response:', data);
      return null;
    }

    // Cache the token (expires in 1 hour, but refresh 5 minutes early to be safe)
    const expiresIn = (data.expires_in || 3600) * 1000; // Convert to milliseconds
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn - (5 * 60 * 1000), // Refresh 5 min early
    };

    console.log('Fannie Mae API: Successfully obtained access token');
    return data.access_token;
  } catch (error) {
    console.error('Fannie Mae API: Error getting access token:', error);
    return null;
  }
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
  const token = await getAccessToken();
  if (!token) {
    console.error('Fannie Mae API: Could not obtain access token');
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
        'x-public-access-token': token,
      },
    });

    console.log('Fannie Mae API: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fannie Mae API: Error response:', errorText);
      
      if (response.status === 401) {
        console.error('Fannie Mae API: Unauthorized - Token may have expired or is invalid');
        // Clear cached token to force refresh
        cachedToken = null;
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

