import type { VercelRequest, VercelResponse } from '@vercel/node';

const FANNIE_MAE_API_BASE_URL = 'https://api.fanniemae.com';

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

    // Use the correct Fannie Mae Income Limits API endpoint
    // Based on OpenAPI spec: /v1/income-limits/addresscheck
    // Required parameters: number, street, city, state, zip
    // Since we only have ZIP code, we'll use minimal placeholder values for other required fields
    // The API should still work as long as the ZIP code is valid
    
    // For ZIP-only lookups, we'll use placeholder values for required address fields
    // The API will use the ZIP code to determine the census tract and return income limits
    const params = new URLSearchParams({
      number: '1',              // Placeholder building number
      street: 'Main St',        // Placeholder street name
      city: 'City',             // Placeholder city name
      state: 'UT',              // Placeholder state (will be determined by ZIP)
      zip: zipCode              // The actual ZIP code we have
    });

    const url = `${FANNIE_MAE_API_BASE_URL}/v1/income-limits/addresscheck?${params.toString()}`;
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
      // Read the error response body once
      let errorText = '';
      try {
        errorText = await fannieMaeResponse.text();
        console.error('Fannie Mae API Proxy: Error response:', errorText.substring(0, 500));
      } catch (error) {
        console.error('Fannie Mae API Proxy: Could not read error response body:', error);
        errorText = 'Unknown error';
      }
      console.error('Fannie Mae API Proxy: Tried URL:', url);
      
      response.setHeader('Access-Control-Allow-Origin', '*');
      
      if (fannieMaeResponse.status === 401) {
        return response.status(401).json({ 
          error: 'Unauthorized - API key may be invalid or expired',
          details: 'Please verify your API key in Vercel environment variables',
          triedUrl: url
        });
      } else if (fannieMaeResponse.status === 403) {
        return response.status(403).json({ 
          error: 'Forbidden - API key may not have access to this endpoint',
          details: 'Please check: 1) Your API key has access to Income Limits API, 2) The API key is correctly set in Vercel',
          triedUrl: url,
          errorResponse: errorText.substring(0, 500)
        });
      } else if (fannieMaeResponse.status === 404) {
        return response.status(404).json({ 
          error: `Income limits not found for ZIP code ${zipCode}`,
          triedUrl: url
        });
      } else if (fannieMaeResponse.status === 400) {
        return response.status(400).json({ 
          error: `Bad Request - Invalid address parameters for ZIP code: ${zipCode}`,
          details: 'The API requires valid address components. ZIP code alone may not be sufficient.',
          triedUrl: url
        });
      } else {
        return response.status(fannieMaeResponse.status).json({ 
          error: `Fannie Mae API Error: ${fannieMaeResponse.statusText}`,
          details: errorText.substring(0, 500),
          triedUrl: url
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

