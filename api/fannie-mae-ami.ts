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
    // Get address or zip code from query parameter
    const addressInput = request.query.address as string;
    const zipCode = request.query.zipCode as string;

    // Determine if we have a full address or just ZIP code
    const isFullAddress = addressInput && addressInput.trim().length > 5 && !/^\d{5}$/.test(addressInput.trim());
    const isZipOnly = zipCode && zipCode.length === 5 && !addressInput;

    if (!isFullAddress && !isZipOnly) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(400).json({ 
        error: 'Either a full address or a 5-digit zip code is required',
        received: { addressInput, zipCode }
      });
    }

    let fannieMaeResponse: Response;
    let url = '';

    if (isFullAddress) {
      // Parse the full address using OpenAI
      console.log('Fannie Mae API Proxy: Parsing full address:', addressInput);
      
      // Import and use OpenAI API directly (same as parse-address.ts)
      const openaiApiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      
      if (!openaiApiKey) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({
          error: 'OpenAI API key not configured',
          details: 'Add VITE_OPENAI_API_KEY to Vercel environment variables for address parsing'
        });
      }

      const parsePrompt = `Parse this address into structured components for Fannie Mae API. Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Address: "${addressInput}"

Extract and return:
- number (string) - Building/house number (e.g., "123", "1", "100A"). If not found, use "1"
- street (string) - Street name (e.g., "Main St", "Oak Avenue", "Park Blvd"). If not found, use "Main St"
- city (string) - City name (e.g., "Salt Lake City", "New York"). If not found, use "City"
- state (string) - Two-letter state abbreviation (e.g., "UT", "NY", "CA"). Must be exactly 2 letters. If not found, try to infer from ZIP code or use "UT"
- zip (string) - 5-digit ZIP code. Must be exactly 5 digits. Required.

Important:
- Extract ZIP code from the address if present
- State must be 2-letter abbreviation (e.g., "UT" not "Utah", "CA" not "California")
- Return ONLY the JSON object, nothing else:`;

      const parseResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: parsePrompt }],
          temperature: 0.1,
          max_tokens: 256,
          response_format: { type: 'json_object' }
        })
      });

      if (!parseResponse.ok) {
        const errorText = await parseResponse.text();
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(parseResponse.status).json({
          error: 'Failed to parse address with OpenAI',
          details: errorText.substring(0, 200)
        });
      }

      const parseData = await parseResponse.json();
      const parseText = parseData.choices?.[0]?.message?.content;
      
      if (!parseText) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({ error: 'No response from OpenAI API' });
      }

      // Clean and parse JSON
      let cleanText = parseText.trim().replace(/```json\n?/gi, '').replace(/```\n?/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanText = jsonMatch[0];
      
      const parsedAddress = JSON.parse(cleanText);

      if (!parsedAddress.zip || parsedAddress.zip.length !== 5) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(400).json({ 
          error: 'Could not extract valid 5-digit ZIP code from address',
          parsed: parsedAddress
        });
      }

      console.log('Fannie Mae API Proxy: Parsed address:', parsedAddress);

      // Use addresscheck endpoint with parsed address
      const params = new URLSearchParams({
        number: parsedAddress.number || '1',
        street: parsedAddress.street || 'Main St',
        city: parsedAddress.city || 'City',
        state: parsedAddress.state || 'UT',
        zip: parsedAddress.zip
      });

      url = `${FANNIE_MAE_API_BASE_URL}/v1/income-limits/addresscheck?${params.toString()}`;
      console.log('Fannie Mae API Proxy: Fetching from addresscheck endpoint:', url);

    } else {
      // ZIP code only - convert to FIPS and use censustracts endpoint
      console.log('Fannie Mae API Proxy: Converting ZIP code to FIPS:', zipCode);
      
      // Use US Census Bureau Geocoding API directly
      const geocodeUrl = `https://geocoding.geo.census.gov/geocoder/geographies/address?street=1+Main+St&city=City&state=UT&zip=${zipCode}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
      
      const geocodeResponse = await fetch(geocodeUrl);

      if (!geocodeResponse.ok) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({
          error: 'Failed to geocode ZIP code',
          details: 'Census Bureau API returned an error'
        });
      }

      const geocodeData = await geocodeResponse.json();
      
      // Extract FIPS code from response
      let fipsCode: string | null = null;

      if (geocodeData.result && geocodeData.result.addressMatches && geocodeData.result.addressMatches.length > 0) {
        const match = geocodeData.result.addressMatches[0];
        if (match.geographies && match.geographies['Census Tracts'] && match.geographies['Census Tracts'].length > 0) {
          fipsCode = match.geographies['Census Tracts'][0].GEOID;
        }
      }

      if (!fipsCode || fipsCode.length !== 11) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(404).json({
          error: `Could not find FIPS code for ZIP code ${zipCode}`,
          details: 'The ZIP code may not be valid or the geocoding service may be unavailable',
          suggestion: 'Try using a full address instead'
        });
      }

      console.log('Fannie Mae API Proxy: Converted ZIP to FIPS:', zipCode, '->', fipsCode);

      // Use censustracts endpoint with FIPS code
      url = `${FANNIE_MAE_API_BASE_URL}/v1/income-limits/censustracts?fips_code=${fipsCode}`;
      console.log('Fannie Mae API Proxy: Fetching from censustracts endpoint:', url);
    }

    fannieMaeResponse = await fetch(url, {
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
          error: `Income limits not found${isFullAddress ? ' for address' : ` for ZIP code ${zipCode}`}`,
          triedUrl: url
        });
      } else if (fannieMaeResponse.status === 400) {
        return response.status(400).json({ 
          error: `Bad Request - Invalid parameters${isFullAddress ? ' for address' : ` for ZIP code ${zipCode}`}`,
          details: isFullAddress 
            ? 'The address could not be parsed correctly or is invalid'
            : 'The ZIP code could not be converted to a valid FIPS code',
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

