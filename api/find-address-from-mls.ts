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

    const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Use OpenAI to find the property address from MLS number
    const systemPrompt = `You are a real estate assistant. Your job is to find the property address associated with an MLS number. Search for the MLS listing and return ONLY the complete property address.`;

    const userPrompt = `Find the property address for MLS number: ${mlsNumber}

Search for this MLS listing and return the complete property address in this format:
[Street Number] [Street Name], [City], [State] [Zip Code]

Example: "626 W Cottle Ln, Farmington, UT 84025"

If you cannot find the address, return null. Return ONLY the address, no explanations, no markdown, no code blocks, no JSON.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
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
    const address = data.choices?.[0]?.message?.content?.trim() || null;

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

