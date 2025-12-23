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
    const { scenarioData } = request.body;

    if (!scenarioData || typeof scenarioData !== 'object') {
      return response.status(400).json({ error: 'Scenario data is required' });
    }

    // Build a descriptive prompt based on scenario data
    const loanType = scenarioData.loanType || 'Conventional';
    const downPaymentPercent = scenarioData.downPaymentPercent || 0;
    const interestRate = scenarioData.interestRate || 0;
    const purchasePrice = scenarioData.purchasePrice || 0;
    const transactionType = scenarioData.transactionType || 'Purchase';
    const clientName = scenarioData.clientName || 'Client';
    const propertyAddress = scenarioData.propertyAddress || '';
    
    // Extract key differentiating factors
    const factors = [];
    if (downPaymentPercent > 0) {
      factors.push(`${downPaymentPercent}% down`);
    }
    if (interestRate > 0) {
      factors.push(`${interestRate}% rate`);
    }
    if (purchasePrice > 0) {
      const priceInK = Math.round(purchasePrice / 1000);
      factors.push(`$${priceInK}k`);
    }
    
    const prompt = `Generate a concise, descriptive scenario name for a mortgage loan scenario. The name should help differentiate this scenario from others for the same borrower.

Scenario Details:
- Loan Type: ${loanType}
- Transaction Type: ${transactionType}
- Down Payment: ${downPaymentPercent}%
- Interest Rate: ${interestRate}%
- Purchase Price: $${purchasePrice.toLocaleString()}
- Borrower: ${clientName}
${propertyAddress ? `- Property: ${propertyAddress}` : ''}

Key Differentiators: ${factors.join(', ')}

Requirements:
1. Keep it short (3-8 words max)
2. Include the loan type (${loanType})
3. Include the down payment percentage (${downPaymentPercent}%)
4. Optionally include interest rate if it's a key differentiator
5. Make it professional and clear
6. Do NOT include the borrower name or property address in the name
7. Return ONLY the scenario name, nothing else - no quotes, no explanations, just the name

Example good names:
- "FHA 3.5% Down"
- "Conventional 20% - 6.5% Rate"
- "VA 0% Down"
- "FHA 3.5% - 6.25%"
- "Conventional 10% Down"

Generate the scenario name now:`;

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
          temperature: 0.7,
          max_tokens: 50
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

    // Clean the response - remove quotes, trim whitespace
    let cleanName = text.trim();
    cleanName = cleanName.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
    cleanName = cleanName.trim();

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({ name: cleanName });

  } catch (error) {
    console.error('Generate Name Error:', error);
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

