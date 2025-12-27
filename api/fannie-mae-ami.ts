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
      
      // Import and use OpenAI API directly (same as parse-address.ts)
      const openaiApiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      
      if (!openaiApiKey) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({
          error: 'OpenAI API key not configured',
          details: 'Add VITE_OPENAI_API_KEY to Vercel environment variables for address parsing'
        });
      }

      // CRITICAL INSIGHT: Fannie Mae API validates addresses against their geocoding database
      // Addresses must be in standard USPS/geocoding format that their service recognizes
      // For quadrant-based addresses (like "S 2275 E" in Salt Lake City), we MUST convert to standard format
      const parsePrompt = `You are an expert at normalizing US addresses for geocoding APIs. 

Fannie Mae's API validates addresses against their geocoding database. If the format isn't recognized, it fails.

INPUT: "${addressInput}"

TASK: Convert this to standard USPS/geocoding format that geocoding services (Google Maps, USPS, etc.) recognize.

CRITICAL RULES:
1. For quadrant addresses like "S 2275 E" (Salt Lake City style):
   - These are NOT recognized by standard geocoding
   - Convert to standard format: "2275 East Street" or "2275 E Street" 
   - The "S" prefix indicates South quadrant - remove it and convert to standard street name
   
2. Street name format:
   - Spell out directional prefixes: "N Main St" → "North Main Street"
   - Spell out street types: "St" → "Street", "Ave" → "Avenue", "Blvd" → "Boulevard"
   - Use standard formats that exist in address databases
   
3. Output JSON format:
{
  "number": "123",
  "street": "Main Street", 
  "city": "Salt Lake City",
  "state": "UT",
  "zip": "84101"
}

EXAMPLES:
- "6230 S 2275 E, Holladay, UT 84121" 
  → {"number":"6230","street":"2275 East Street","city":"Holladay","state":"UT","zip":"84121"}
  (Convert quadrant format "S 2275 E" to standard "2275 East Street")
  
- "123 N Main St, Salt Lake City, UT 84101"
  → {"number":"123","street":"North Main Street","city":"Salt Lake City","state":"UT","zip":"84101"}
  
- "123 Main St, New York, NY 10001"
  → {"number":"123","street":"Main Street","city":"New York","state":"NY","zip":"10001"}

Return ONLY valid JSON, no markdown, no explanations:`;

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

      // Use addresscheck endpoint with parsed address - using GET with query parameters
      // Build parameters carefully, ensuring no undefined/null values
      const addressParams = {
        number: parsedAddress.number || '1',
        street: parsedAddress.street || 'Main St',
        city: parsedAddress.city || 'City',
        state: parsedAddress.state || 'UT',
        zip: parsedAddress.zip
      };
      
      const params = new URLSearchParams(addressParams);
      const encodedUrl = `${FANNIE_MAE_API_BASE_URL}/v1/income-limits/addresscheck?${params.toString()}`;
      
      url = encodedUrl;

    } else {
      // ZIP code only - Generate a representative address using OpenAI
      // Then use that address with Fannie Mae's addresscheck endpoint
      
      const openaiApiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      
      if (!openaiApiKey) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({
          error: 'OpenAI API key not configured',
          details: 'ZIP code lookups require OpenAI API key to generate representative addresses. Add VITE_OPENAI_API_KEY to Vercel environment variables.'
        });
      }

      // Use OpenAI to generate a representative address for the ZIP code
      const zipToAddressPrompt = `Given a US ZIP code, generate a representative address that would be valid in that ZIP code area. This address will be used to look up income limits, so it should be a typical residential address format for that area.

ZIP Code: ${zipCode}

Return ONLY valid JSON with this structure:
{
  "number": "123",
  "street": "Main Street",
  "city": "City Name",
  "state": "ST",
  "zip": "12345"
}

Requirements:
- Use a common street name (e.g., "Main Street", "Oak Avenue", "Park Boulevard") 
- Use a typical city name for that ZIP code area (you may need to look up common cities in that ZIP)
- State must be the correct 2-letter abbreviation for that ZIP code
- ZIP must match the input ZIP code exactly: ${zipCode}
- Number should be a typical residential number (e.g., "123", "456", "100")
- Street should include street type (Street, Avenue, Boulevard, etc.)

Return ONLY the JSON object, no markdown, no explanations:`;

      const zipParseResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: zipToAddressPrompt }],
          temperature: 0.1,
          max_tokens: 256,
          response_format: { type: 'json_object' }
        })
      });

      if (!zipParseResponse.ok) {
        const errorText = await zipParseResponse.text();
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({
          error: 'Failed to generate representative address from ZIP code',
          details: errorText.substring(0, 200)
        });
      }

      const zipParseData = await zipParseResponse.json();
      const zipParseText = zipParseData.choices?.[0]?.message?.content;
      
      if (!zipParseText) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(500).json({ 
          error: 'No response from OpenAI API when generating address from ZIP code' 
        });
      }

      // Clean and parse JSON
      let cleanZipText = zipParseText.trim().replace(/```json\n?/gi, '').replace(/```\n?/g, '');
      const jsonZipMatch = cleanZipText.match(/\{[\s\S]*\}/);
      if (jsonZipMatch) cleanZipText = jsonZipMatch[0];
      
      const representativeAddress = JSON.parse(cleanZipText);

      if (!representativeAddress.zip || representativeAddress.zip.length !== 5 || representativeAddress.zip !== zipCode) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        return response.status(400).json({ 
          error: 'Could not generate valid representative address for ZIP code',
          details: 'OpenAI generated address did not match the requested ZIP code',
          generated: representativeAddress
        });
      }

      // Use addresscheck endpoint with the generated representative address
      const addressParams = {
        number: representativeAddress.number || '123',
        street: representativeAddress.street || 'Main Street',
        city: representativeAddress.city || 'City',
        state: representativeAddress.state || 'UT',
        zip: representativeAddress.zip
      };
      
      const params = new URLSearchParams(addressParams);
      url = `${FANNIE_MAE_API_BASE_URL}/v1/income-limits/addresscheck?${params.toString()}`;
    }

    fannieMaeResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-public-access-token': apiKey,
      },
    });

    if (!fannieMaeResponse.ok) {
      // Read the error response body once
      let errorText = '';
      let errorJson: any = null;
      try {
        errorText = await fannieMaeResponse.text();
        
        // Try to parse as JSON
        try {
          errorJson = JSON.parse(errorText);
        } catch {
          // Not JSON, use as text
        }
      } catch (error) {
        errorText = 'Unknown error';
      }
      
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

