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
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(500).json({ 
      error: 'OpenAI API key not configured. Add VITE_OPENAI_API_KEY to Vercel environment variables.' 
    });
  }

  try {
    const { address } = request.body;

    if (!address || typeof address !== 'string') {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(400).json({ error: 'Address string is required' });
    }

    const prompt = `Parse this address into structured components for Fannie Mae API. Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Address: "${address}"

Extract and return:
- number (string) - Building/house number (e.g., "123", "1", "100A"). If not found, use "1"
- street (string) - Street name (e.g., "Main St", "Oak Avenue", "Park Blvd"). If not found, use "Main St"
- city (string) - City name (e.g., "Salt Lake City", "New York"). If not found, use "City"
- state (string) - Two-letter state abbreviation (e.g., "UT", "NY", "CA"). Must be exactly 2 letters. If not found, try to infer from ZIP code or use "UT"
- zip (string) - 5-digit ZIP code. Must be exactly 5 digits. Required.

Important:
- If only a ZIP code is provided (e.g., "84121"), return: {"number":"1","street":"Main St","city":"City","state":"UT","zip":"84121"}
- Extract ZIP code from the address if present
- State must be 2-letter abbreviation (e.g., "UT" not "Utah", "CA" not "California")
- If ZIP code is found, try to infer state from common ZIP code patterns (e.g., 84xxx = UT, 90xxx = CA, 10xxx = NY)
- Return ONLY the JSON object, nothing else:`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.1,
        max_tokens: 256,
        response_format: { type: 'json_object' }
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API Error:', errorText);
      
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(openaiResponse.status).json({ 
        error: 'Failed to parse address with OpenAI API',
        details: errorText.substring(0, 200)
      });
    }

    const data = await openaiResponse.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(500).json({ 
        error: 'No response from OpenAI API' 
      });
    }

    // Clean JSON from response
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json\n?/gi, '');
    cleanText = cleanText.replace(/```\n?/g, '');
    
    // Extract JSON object
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }

    const parsed = JSON.parse(cleanText);

    // Validate required fields
    if (!parsed.zip || parsed.zip.length !== 5) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(400).json({ 
        error: 'Could not extract valid 5-digit ZIP code from address',
        parsed
      });
    }

    // Ensure state is 2 letters
    if (parsed.state && parsed.state.length > 2) {
      // Try to convert full state name to abbreviation (basic mapping)
      const stateMap: { [key: string]: string } = {
        'utah': 'UT', 'california': 'CA', 'new york': 'NY', 'texas': 'TX',
        'florida': 'FL', 'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH',
        'georgia': 'GA', 'north carolina': 'NC', 'michigan': 'MI', 'new jersey': 'NJ'
      };
      const stateLower = parsed.state.toLowerCase();
      parsed.state = stateMap[stateLower] || parsed.state.substring(0, 2).toUpperCase();
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json(parsed);

  } catch (error) {
    console.error('Parse Address Error:', error);
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    if (error instanceof SyntaxError) {
      return response.status(500).json({ 
        error: 'Could not parse AI response',
        details: error.message 
      });
    }
    
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

