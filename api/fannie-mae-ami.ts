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

      const parsePrompt = `Parse this US address into structured components for Fannie Mae API. IMPORTANT: Normalize street names to standard format that geocoding services recognize.

Address: "${addressInput}"

Extract and return:
- number (string) - Building/house number only (e.g., "123", "1", "100A"). Just the numeric part before the street name. If not found, use "1"
- street (string) - Street name in STANDARDIZED format. Normalize directional prefixes/suffixes:
  * Convert directional prefixes like "S", "N", "E", "W" to full names when appropriate (e.g., "S Main St" → "South Main Street" or keep as "Main St" if it's part of the street name)
  * For addresses like "S 2275 E", this is unusual - try "2275 East" or "2275 E Street" or keep as-is if that's the actual street name
  * Include street type (St, Ave, Blvd, etc.)
  * Examples: "Main St", "North Oak Avenue", "2275 East Street", "Park Boulevard"
- city (string) - City name (e.g., "Salt Lake City", "Holladay", "New York"). Extract the actual city name.
- state (string) - Two-letter state abbreviation (e.g., "UT", "NY", "CA"). Must be exactly 2 uppercase letters. Extract from the address or infer from ZIP code.
- zip (string) - 5-digit ZIP code. Must be exactly 5 digits. Required.

Examples:
- "6230 S 2275 E, Holladay, UT, 84121" → Try {"number":"6230","street":"2275 East","city":"Holladay","state":"UT","zip":"84121"} OR {"number":"6230","street":"2275 E","city":"Holladay","state":"UT","zip":"84121"}
- "123 Main St, Salt Lake City, UT 84101" → {"number":"123","street":"Main Street","city":"Salt Lake City","state":"UT","zip":"84101"}
- "84121" → {"number":"1","street":"Main Street","city":"City","state":"UT","zip":"84121"}

Important:
- Normalize street names to formats that geocoding APIs commonly recognize
- Spell out street types (St → Street, Ave → Avenue) when appropriate
- State must be 2-letter uppercase abbreviation
- ZIP code is required and must be 5 digits
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

      console.log('Fannie Mae API Proxy: Parsed address:', JSON.stringify(parsedAddress, null, 2));

      // Use addresscheck endpoint with parsed address - using GET with query parameters
      // Build parameters carefully, ensuring no undefined/null values
      const addressParams = {
        number: parsedAddress.number || '1',
        street: parsedAddress.street || 'Main St',
        city: parsedAddress.city || 'City',
        state: parsedAddress.state || 'UT',
        zip: parsedAddress.zip
      };
      
      console.log('Fannie Mae API Proxy: Address parameters (before encoding):', JSON.stringify(addressParams, null, 2));
      
      const params = new URLSearchParams(addressParams);
      const encodedUrl = `${FANNIE_MAE_API_BASE_URL}/v1/income-limits/addresscheck?${params.toString()}`;
      
      console.log('Fannie Mae API Proxy: Final URL to Fannie Mae:', encodedUrl);
      console.log('Fannie Mae API Proxy: API Key present:', !!apiKey, '(length:', apiKey?.length || 0, ')');
      console.log('Fannie Mae API Proxy: API Key header will be: x-public-access-token');
      
      url = encodedUrl;

    } else {
      // ZIP code only - Cannot convert ZIP to FIPS without a real address
      // The Census Bureau API requires a real address, not placeholders
      // Fannie Mae's censustracts endpoint requires an 11-digit FIPS code
      // 
      // SOLUTION: Use Fannie Mae's addresscheck endpoint with a representative address
      // We'll construct a minimal valid address using just the ZIP code
      // This is a limitation - for accurate results, users should provide full addresses
      console.log('Fannie Mae API Proxy: ZIP code only provided, cannot get FIPS without real address');
      
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(400).json({
        error: 'ZIP code only lookups require additional address information',
        details: 'The Fannie Mae API requires a full address or an 11-digit FIPS code. ZIP codes alone cannot be converted to FIPS codes without a real address.',
        suggestion: 'Please provide a full address (e.g., "123 Main St, City, ST 84121") or contact Fannie Mae support for ZIP-to-FIPS conversion options',
        zipCode: zipCode
      });
    }

    // Log exactly what we're sending
    console.log('Fannie Mae API Proxy: About to call Fannie Mae API');
    console.log('Fannie Mae API Proxy: Method: GET');
    console.log('Fannie Mae API Proxy: URL:', url);
    console.log('Fannie Mae API Proxy: Headers:', {
      'Content-Type': 'application/json',
      'x-public-access-token': apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING'
    });

    fannieMaeResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-public-access-token': apiKey,
      },
    });

    console.log('Fannie Mae API Proxy: Response status:', fannieMaeResponse.status);
    console.log('Fannie Mae API Proxy: Response headers:', Object.fromEntries(fannieMaeResponse.headers.entries()));

    if (!fannieMaeResponse.ok) {
      // Read the error response body once
      let errorText = '';
      let errorJson: any = null;
      try {
        errorText = await fannieMaeResponse.text();
        console.error('Fannie Mae API Proxy: Error response (raw):', errorText);
        
        // Try to parse as JSON
        try {
          errorJson = JSON.parse(errorText);
          console.error('Fannie Mae API Proxy: Error response (parsed):', JSON.stringify(errorJson, null, 2));
        } catch {
          // Not JSON, use as text
          console.error('Fannie Mae API Proxy: Error response (text):', errorText.substring(0, 500));
        }
      } catch (error) {
        console.error('Fannie Mae API Proxy: Could not read error response body:', error);
        errorText = 'Unknown error';
      }
      console.error('Fannie Mae API Proxy: ========== ERROR DETAILS ==========');
      console.error('Fannie Mae API Proxy: Request URL:', url);
      console.error('Fannie Mae API Proxy: Response status:', fannieMaeResponse.status);
      console.error('Fannie Mae API Proxy: Response status text:', fannieMaeResponse.statusText);
      console.error('Fannie Mae API Proxy: Error text (raw):', errorText);
      console.error('Fannie Mae API Proxy: Error JSON (parsed):', JSON.stringify(errorJson, null, 2));
      console.error('Fannie Mae API Proxy: ====================================');
      
      response.setHeader('Access-Control-Allow-Origin', '*');
      
      // Extract error message from Fannie Mae response
      // Fannie Mae API errors often have a "messages" array or "message" field
      let fannieMaeErrorMessage = '';
      if (errorJson) {
        if (errorJson.messages && Array.isArray(errorJson.messages)) {
          fannieMaeErrorMessage = errorJson.messages.map((m: any) => 
            typeof m === 'string' ? m : m.message || m.text || JSON.stringify(m)
          ).join('; ');
        } else if (errorJson.message) {
          fannieMaeErrorMessage = errorJson.message;
        } else if (errorJson.error) {
          fannieMaeErrorMessage = errorJson.error;
        } else {
          fannieMaeErrorMessage = JSON.stringify(errorJson);
        }
      } else {
        fannieMaeErrorMessage = errorText.substring(0, 1000);
      }
      
      if (fannieMaeResponse.status === 401) {
        return response.status(401).json({ 
          error: 'Unauthorized - API key may be invalid or expired',
          details: 'Please verify your API key in Vercel environment variables',
          triedUrl: url,
          fannieMaeError: fannieMaeErrorMessage
        });
      } else if (fannieMaeResponse.status === 403) {
        return response.status(403).json({ 
          error: 'Forbidden - API key may not have access to this endpoint',
          details: 'Please check: 1) Your API key has access to Income Limits API, 2) The API key is correctly set in Vercel',
          triedUrl: url,
          fannieMaeError: fannieMaeErrorMessage
        });
      } else if (fannieMaeResponse.status === 404) {
        return response.status(404).json({ 
          error: `Income limits not found${isFullAddress ? ' for address' : ` for ZIP code ${zipCode}`}`,
          triedUrl: url,
          fannieMaeError: fannieMaeErrorMessage
        });
      } else if (fannieMaeResponse.status === 400) {
        return response.status(400).json({ 
          error: `Address not recognized by Fannie Mae geocoding service${isFullAddress ? '' : ` for ZIP code ${zipCode}`}`,
          details: isFullAddress 
            ? 'Fannie Mae\'s geocoding service could not find or validate this address. This may happen if: (1) The address format is not recognized (e.g., quadrant-based addresses like "S 2275 E"), (2) The address is new or recently changed, (3) The address components are not in the expected format. Try using a more standard address format or contact Fannie Mae support.'
            : 'The ZIP code may be invalid',
          triedUrl: url,
          fannieMaeError: errorJson || errorText.substring(0, 1000),
          fannieMaeMessages: errorJson?.messages || null,
          suggestion: isFullAddress ? 'Try formatting the address differently (e.g., spell out street types, normalize directional indicators)' : 'Try using a full address instead'
        });
      } else {
        return response.status(fannieMaeResponse.status).json({ 
          error: `Fannie Mae API Error: ${fannieMaeResponse.statusText}`,
          details: fannieMaeErrorMessage,
          triedUrl: url,
          fannieMaeError: errorJson || errorText.substring(0, 500)
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

