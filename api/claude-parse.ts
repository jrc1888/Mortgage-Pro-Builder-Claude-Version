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

  const apiKey = process.env.VITE_CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ 
      error: 'Claude API key not configured. Add VITE_CLAUDE_API_KEY to Vercel environment variables.' 
    });
  }

  try {
    const { input } = request.body;

    if (!input || typeof input !== 'string') {
      return response.status(400).json({ error: 'Input text is required' });
    }

    const prompt = `Extract mortgage scenario data from this text. Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Input: "${input}"

Extract if present:
- purchasePrice (number)
- downPaymentPercent (number)  
- loanType ("Conventional"|"FHA"|"VA"|"Jumbo")
- clientName (string)
- propertyAddress (string)
- interestRate (number)
- creditScore (number)

Return this EXACT format:
{"purchasePrice":500000,"downPaymentPercent":10,"loanType":"FHA","clientName":"John Smith","confidence":90,"clarifications":["What interest rate?"]}

Return ONLY the JSON object, nothing else:`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API Error:', errorText);
      
      return response.status(claudeResponse.status).json({ 
        error: `Claude API error: ${errorText.substring(0, 200)}` 
      });
    }

    const data = await claudeResponse.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      return response.status(500).json({ 
        error: 'No response from Claude API' 
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

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json(parsed);

  } catch (error) {
    console.error('Parse Error:', error);
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    if (error instanceof SyntaxError) {
      return response.status(500).json({ 
        error: 'Could not parse AI response. Try simpler phrasing.',
        details: error.message 
      });
    }
    
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
