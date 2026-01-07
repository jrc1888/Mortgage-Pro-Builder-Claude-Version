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
    const { address } = request.body;

    if (!address || typeof address !== 'string') {
      return response.status(400).json({ error: 'Address is required' });
    }

    const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Use OpenAI to normalize the address
    const systemPrompt = `You are an address normalization assistant. Your job is to take a potentially incomplete or informal address and convert it into a properly formatted, complete address. Return ONLY the normalized address, nothing else.`;

    const userPrompt = `Normalize this address into a complete, properly formatted address with street number, street name, city, state (abbreviation), and zip code if possible:

"${address}"

Return ONLY the normalized address in this format:
[Street Number] [Street Name], [City], [State] [Zip Code]

Example: "626 W Cottle Ln, Farmington, UT 84025"

If you cannot determine certain parts (like zip code), include what you can determine. Return ONLY the address, no explanations, no markdown, no code blocks.`;

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
    const normalizedAddress = data.choices?.[0]?.message?.content?.trim() || null;

    if (!normalizedAddress) {
      return response.status(500).json({ error: 'Failed to normalize address' });
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({
      success: true,
      normalizedAddress: normalizedAddress,
      originalAddress: address
    });

  } catch (error) {
    console.error('Error normalizing address:', error);
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

