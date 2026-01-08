import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return response.status(200).end();
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mlsNumber } = request.body;

    if (!mlsNumber || typeof mlsNumber !== 'string') {
      return response.status(400).json({ error: 'MLS number is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Use OpenAI Responses API with web_search to find the property address from MLS number
    const instructions = `You are a real estate assistant. Your job is to find the property address associated with an MLS number. Use web_search to find the MLS listing and return the complete property address.`;

    const input = `Find the property address for MLS number: ${mlsNumber}

Use web_search to find this MLS listing. Return the complete property address in the format:
[Street Number] [Street Name], [City], [State] [Zip Code]

Example: "626 W Cottle Ln, Farmington, UT 84025"

If you cannot find the address in web search results, return null.`;

    // JSON Schema for address response
    const addressSchema = {
      type: 'object',
      properties: {
        address: { 
          type: ['string', 'null'], 
          description: 'Complete property address in format: [Street Number] [Street Name], [City], [State] [Zip Code]'
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of source URLs used to find the address (optional)'
        }
      },
      required: ['address']
    };

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5',
        instructions: instructions,
        input: input,
        tools: [{ type: 'web_search' }],
        text: {
          format: {
            type: 'json_schema',
            json_schema: addressSchema
          }
        },
        include: ['web_search_call.action.sources']
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      let errorMessage = 'OpenAI API error';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorText.substring(0, 200);
      } catch {
        errorMessage = errorText.substring(0, 200);
      }
      return response.status(500).json({ error: errorMessage });
    }

    const data = await openaiResponse.json();
    
    // Extract output_text from Responses API
    let outputText: string;
    if (data.output_text) {
      outputText = data.output_text;
    } else if (data.output?.text) {
      outputText = data.output.text;
    } else if (data.text) {
      outputText = data.text;
    } else {
      throw new Error('No output_text found in OpenAI Responses API response');
    }

    let result: { address: string | null; sources?: string[] };
    try {
      result = JSON.parse(outputText);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw output_text:', outputText);
      return response.status(500).json({ error: 'Failed to parse address from OpenAI response' });
    }

    const address = result.address?.trim() || null;

    if (!address || address.toLowerCase() === 'null') {
      return response.status(404).json({ error: 'Could not find address for this MLS number' });
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({
      success: true,
      address: address,
      mlsNumber: mlsNumber
    });

  } catch (error) {
    console.error('Error finding address from MLS:', error);
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

