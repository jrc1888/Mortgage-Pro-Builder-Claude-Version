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
    const { input } = request.body;

    if (!input || typeof input !== 'string') {
      return response.status(400).json({ error: 'Input text is required' });
    }

    const prompt = `Extract mortgage scenario data from this text. Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Input: "${input}"

Extract if present:
- purchasePrice (number) - property purchase price or value
- downPaymentPercent (number) - down payment as percentage (e.g., 20 means 20%)
- downPaymentAmount (number) - down payment as dollar amount (optional, can calculate from percent)
- loanType ("Conventional"|"FHA"|"VA"|"Jumbo") - must match exactly
- transactionType ("Purchase"|"Refinance") - infer from context (buying = Purchase, refinancing = Refinance)
- clientName (string) - borrower/client name
- propertyAddress (string) - full property address if mentioned
- interestRate (number) - interest rate percentage
- creditScore (number) - credit score
- propertyTaxYearly (number) - annual property taxes if mentioned
- hoaMonthly (number) - monthly HOA dues if mentioned

Return this EXACT format:
{"purchasePrice":500000,"downPaymentPercent":10,"loanType":"FHA","clientName":"John Smith","transactionType":"Purchase","confidence":90,"clarifications":["What interest rate?"]}

Important: 
- Set confidence (0-100) based on how much data was extracted
- Include clarifications array for missing important fields
- transactionType defaults to "Purchase" unless text mentions refinancing/refinance/refi
- Return ONLY the JSON object, nothing else:`;

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

      openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
          errorMessage = 'Rate limit exceeded. OpenAI has limits on requests per minute. Please wait a moment and try again, or check your OpenAI account limits.';
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
