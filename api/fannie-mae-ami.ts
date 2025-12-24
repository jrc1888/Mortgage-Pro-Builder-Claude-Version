import type { VercelRequest, VercelResponse } from '@vercel/node';

const FANNIE_MAE_API_BASE_URL = 'https://api.fanniemae.com/v1';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return response.status(200).end();
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment variables
  const apiKey = process.env.VITE_FANNIE_MAE_API_KEY || process.env.FANNIE_MAE_API_KEY;

  if (!apiKey) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(500).json({ 
      error: 'Fannie Mae API key not configured. Add VITE_FANNIE_MAE_API_KEY to Vercel environment variables.' 
    });
  }

  try {
    // Get zip code from query parameter
    const zipCode = request.query.zipCode as string;

    if (!zipCode || zipCode.length !== 5) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(400).json({ error: 'Valid 5-digit zip code is required' });
    }

    // Try multiple endpoint patterns - Fannie Mae API endpoint structure may vary
    // Based on common REST API patterns and Fannie Mae's API structure
    // The exact endpoint should be found in: https://developer.fanniemae.com/#/products/api/documentation-public/Income%20Limits%20API
    const endpointPatterns = [
      // Income Limits API patterns
      `/income-limits?zipCode=${zipCode}`,
      `/income-limits?zip=${zipCode}`,
      `/income-limits/${zipCode}`,
      `/income-limits/zip/${zipCode}`,
      // AMI Lookup patterns
      `/ami-lookup?zipCode=${zipCode}`,
      `/ami-lookup?zip=${zipCode}`,
      `/ami-lookup/${zipCode}`,
      `/ami-lookup/zip/${zipCode}`,
      // Alternative patterns
      `/ami?zipCode=${zipCode}`,
      `/ami?zip=${zipCode}`,
      `/ami/${zipCode}`,
      // HomeReady evaluation patterns
      `/homeready-evaluation?zipCode=${zipCode}`,
      `/homeready-evaluation?zip=${zipCode}`,
      `/homeready-evaluation/${zipCode}`,
    ];

    let fannieMaeResponse: Response | null = null;
    let lastError: string = '';
    let triedUrl = '';

    // Try each endpoint pattern until one works
    for (const endpoint of endpointPatterns) {
      const url = `${FANNIE_MAE_API_BASE_URL}${endpoint}`;
      triedUrl = url;
      console.log('Fannie Mae API Proxy: Trying endpoint:', url);

      try {
        fannieMaeResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-public-access-token': apiKey,
          },
        });

        console.log(`Fannie Mae API Proxy: Response status for ${endpoint}:`, fannieMaeResponse.status);

        // If we get a 200, 201, or even 404 (endpoint exists but no data), use this endpoint
        if (fannieMaeResponse.ok || fannieMaeResponse.status === 404) {
          console.log(`Fannie Mae API Proxy: Found working endpoint: ${endpoint}`);
          break;
        }

        // If 401/403, the endpoint might be right but auth is wrong, or endpoint is wrong
        // Continue trying other endpoints
        // Note: Don't read the body here - it can only be read once, and we'll read it later if needed
        if (fannieMaeResponse.status === 401 || fannieMaeResponse.status === 403) {
          console.log(`Fannie Mae API Proxy: ${endpoint} returned ${fannieMaeResponse.status}, trying next...`);
          // Store the URL for error reporting, but don't read the body yet
          continue;
        }
      } catch (error) {
        console.error(`Fannie Mae API Proxy: Error trying ${endpoint}:`, error);
        continue;
      }
    }

    if (!fannieMaeResponse) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(500).json({ 
        error: 'Failed to connect to Fannie Mae API',
        details: 'Tried multiple endpoint patterns, all failed. Please check the Fannie Mae Developer Portal for the correct endpoint.',
        triedEndpoints: endpointPatterns
      });
    }

    console.log('Fannie Mae API Proxy: Final response status:', fannieMaeResponse.status);

    if (!fannieMaeResponse.ok) {
      // Read the error response body once
      let errorText = '';
      try {
        errorText = await fannieMaeResponse.text();
        console.error('Fannie Mae API Proxy: Error response:', errorText.substring(0, 500));
      } catch (error) {
        console.error('Fannie Mae API Proxy: Could not read error response body:', error);
        errorText = lastError || 'Unknown error';
      }
      console.error('Fannie Mae API Proxy: Tried URL:', triedUrl);
      
      response.setHeader('Access-Control-Allow-Origin', '*');
      
      if (fannieMaeResponse.status === 401) {
        return response.status(401).json({ 
          error: 'Unauthorized - API key may be invalid or expired',
          details: 'Please verify your API key in Vercel environment variables',
          triedUrl
        });
      } else if (fannieMaeResponse.status === 403) {
        return response.status(403).json({ 
          error: 'Forbidden - API key may not have access to this endpoint, or endpoint URL is incorrect',
          details: 'Please check: 1) Your API key has access to AMI Lookup API, 2) The endpoint URL is correct in Fannie Mae Developer Portal',
          triedUrl,
          errorResponse: errorText.substring(0, 500)
        });
      } else if (fannieMaeResponse.status === 404) {
        return response.status(404).json({ 
          error: `Income limits not found for ZIP code ${zipCode}`,
          triedUrl
        });
      } else if (fannieMaeResponse.status === 400) {
        return response.status(400).json({ 
          error: `Bad Request - Invalid ZIP code format: ${zipCode}`,
          triedUrl
        });
      } else {
        return response.status(fannieMaeResponse.status).json({ 
          error: `Fannie Mae API Error: ${fannieMaeResponse.statusText}`,
          details: errorText.substring(0, 500),
          triedUrl
        });
      }
    }

    const data = await fannieMaeResponse.json();
    console.log('Fannie Mae API Proxy: Successfully retrieved data');

    // Set CORS headers and return data
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json(data);

  } catch (error) {
    console.error('Fannie Mae API Proxy Error:', error);
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: 'Failed to fetch data from Fannie Mae API'
    });
  }
}

