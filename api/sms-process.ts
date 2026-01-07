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

  const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ 
      error: 'OpenAI API key not configured. Add VITE_OPENAI_API_KEY to Vercel environment variables.' 
    });
  }

  try {
    const { url } = request.body;

    if (!url || typeof url !== 'string') {
      return response.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return response.status(400).json({ error: 'Invalid URL format' });
    }

    const prompt = `You are a real estate data extraction assistant. Visit this URL: ${url}
Extract and return ONLY a JSON object with this exact structure:
{
  "address": "full address",
  "price": 425000,
  "beds": 3,
  "baths": 2,
  "sqft": 1850,
  "yearBuilt": 2015,
  "propertyType": "Single Family",
  "hoa": 0,
  "propertyTax": null
}

If HOA is mentioned in the listing, include the monthly amount.
If annual property tax is shown, include it (convert to monthly by dividing by 12).
Be precise with numbers. Return ONLY valid JSON, no markdown, no code blocks, no explanations.`;

    // Retry logic for rate limits (429 errors)
    let openaiResponse;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: wait 1s, 2s, 4s
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Try gpt-4o first, fallback to gpt-4o-mini if needed
      const model = attempt === 0 ? 'gpt-4o' : 'gpt-4o-mini';

      openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: 'user',
            content: prompt
          }],
          temperature: 0.1,
          max_tokens: 1024,
          response_format: { type: 'json_object' }
        })
      });

      // If successful or non-rate-limit error, break
      if (openaiResponse.ok || openaiResponse.status !== 429) {
        break;
      }

      // If rate limited and we have retries left, continue loop
      if (openaiResponse.status === 429 && attempt < maxRetries - 1) {
        const errorText = await openaiResponse.text();
        lastError = errorText;
        continue;
      }
    }

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text() || lastError || 'Unknown error';
      console.error('OpenAI API Error:', errorText);
      
      let errorMessage = 'OpenAI API error';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorText.substring(0, 200);
        
        // Provide helpful message for rate limits
        if (openaiResponse.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
        }
      } catch {
        errorMessage = errorText.substring(0, 200);
      }
      
      return response.status(openaiResponse.status).json({ 
        error: errorMessage
      });
    }

    const data = await openaiResponse.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
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

    let propertyData;
    try {
      propertyData = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw response:', cleanText);
      return response.status(500).json({ 
        error: 'Failed to parse property data from OpenAI response',
        details: 'The AI response was not valid JSON'
      });
    }

    // Validate required fields
    if (!propertyData.address || !propertyData.price) {
      return response.status(500).json({ 
        error: 'Incomplete property data',
        details: 'Missing required fields: address or price'
      });
    }

    // Ensure numeric fields are numbers
    propertyData.price = Number(propertyData.price) || 0;
    propertyData.beds = Number(propertyData.beds) || 0;
    propertyData.baths = Number(propertyData.baths) || 0;
    propertyData.sqft = Number(propertyData.sqft) || 0;
    propertyData.yearBuilt = Number(propertyData.yearBuilt) || new Date().getFullYear();
    propertyData.hoa = propertyData.hoa !== null && propertyData.hoa !== undefined 
      ? Number(propertyData.hoa) 
      : 0;
    
    // Property tax: if provided as annual, convert to monthly
    if (propertyData.propertyTax !== null && propertyData.propertyTax !== undefined) {
      const taxValue = Number(propertyData.propertyTax);
      // If the value seems like an annual amount (> 1000), convert to monthly
      if (taxValue > 1000) {
        propertyData.propertyTax = taxValue / 12;
      } else {
        propertyData.propertyTax = taxValue;
      }
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({
      success: true,
      propertyData
    });

  } catch (error) {
    console.error('SMS Process Error:', error);
    
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

