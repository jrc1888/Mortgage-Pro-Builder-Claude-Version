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

    // Check both environment variable names for backward compatibility
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in Vercel environment variables.' });
    }

    // Use OpenAI Chat Completions to find the property address from MLS number
    const instructions = `You are a real estate assistant. Your job is to find the property address associated with an MLS number.

Return a JSON object with:
- address: Complete property address in format "[Street Number] [Street Name], [City], [State] [Zip Code]" (or null if not found)
- sources: Array of source URLs used (optional, can be empty array)

Example address format: "626 W Cottle Ln, Farmington, UT 84025"

If you cannot find the address, return null for the address field.`;

    const input = `Find the property address for MLS number: ${mlsNumber}

Return the complete property address in the format: [Street Number] [Street Name], [City], [State] [Zip Code]

If you cannot find the address, return null for the address field.`;

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

    // Use OpenAI Chat Completions API with structured JSON output
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200
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
    
    // Extract content from Chat Completions response
    let outputText: string;
    if (data.choices && data.choices[0]?.message?.content) {
      outputText = data.choices[0].message.content;
    } else {
      return response.status(500).json({ error: 'No response content found in OpenAI API response' });
    }
    
    // Clean JSON from response (remove markdown code blocks if present)
    let cleanText = outputText.trim();
    cleanText = cleanText.replace(/```json\n?/gi, '');
    cleanText = cleanText.replace(/```\n?/g, '');
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
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

