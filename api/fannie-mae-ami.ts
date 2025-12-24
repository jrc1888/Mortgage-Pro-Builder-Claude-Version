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

    // TODO: Update this endpoint based on Fannie Mae's actual API documentation
    // Check the Fannie Mae Developer Portal Swagger documentation for the exact endpoint
    // Common patterns might be:
    // - /ami-lookup?zipCode={zipCode}
    // - /income-limits?zipCode={zipCode}
    // - /homeready-evaluation?zipCode={zipCode}
    // - /ami-lookup/{zipCode}
    
    const url = `${FANNIE_MAE_API_BASE_URL}/ami-lookup?zipCode=${zipCode}`;
    console.log('Fannie Mae API Proxy: Fetching from:', url);

    const fannieMaeResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-public-access-token': apiKey,
      },
    });

    console.log('Fannie Mae API Proxy: Response status:', fannieMaeResponse.status);

    if (!fannieMaeResponse.ok) {
      const errorText = await fannieMaeResponse.text();
      console.error('Fannie Mae API Proxy: Error response:', errorText);
      
      response.setHeader('Access-Control-Allow-Origin', '*');
      
      if (fannieMaeResponse.status === 401) {
        return response.status(401).json({ 
          error: 'Unauthorized - API key may be invalid or expired' 
        });
      } else if (fannieMaeResponse.status === 404) {
        return response.status(404).json({ 
          error: `Income limits not found for ZIP code ${zipCode}` 
        });
      } else if (fannieMaeResponse.status === 400) {
        return response.status(400).json({ 
          error: `Bad Request - Invalid ZIP code format: ${zipCode}` 
        });
      } else {
        return response.status(fannieMaeResponse.status).json({ 
          error: `Fannie Mae API Error: ${fannieMaeResponse.statusText}`,
          details: errorText.substring(0, 200)
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

