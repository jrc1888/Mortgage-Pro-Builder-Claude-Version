import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SubmissionPDFRequest {
  scenario: any;
  results: any;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Handle CORS
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ 
      error: 'OpenAI API key not configured. Please set VITE_OPENAI_API_KEY in Vercel environment variables.' 
    });
  }

  try {
    const { scenario, results }: SubmissionPDFRequest = request.body;

    if (!scenario || !results) {
      return response.status(400).json({ error: 'Missing scenario or results data' });
    }

    // Build comprehensive prompt for AI to analyze and structure the submission email
    const prompt = `You are an expert mortgage loan processor assistant. Analyze the following mortgage scenario and create a professional submission email PDF structure optimized for loan processors and assistants.

SCENARIO DATA:
${JSON.stringify({ scenario, results }, null, 2)}

TASK:
1. Analyze the scenario data and identify ALL missing critical information that would be needed for loan processing
2. Structure the information in a processor-friendly format
3. Format the notes field professionally (if provided)
4. Generate specific, actionable prompts for missing information
5. Organize everything into clear sections

REQUIRED SECTIONS (provide structured JSON):
{
  "executiveSummary": {
    "borrowerName": "...",
    "propertyAddress": "...",
    "transactionType": "...",
    "contractDate": "...",
    "faDate": "...",
    "loanType": "...",
    "loanAmount": "...",
    "purchasePrice": "...",
    "ltv": "...",
    "downPayment": "...",
    "interestRate": "...",
    "monthlyPayment": "..."
  },
  "loanDetails": {
    "loanTerm": "...",
    "occupancyType": "...",
    "creditScore": "...",
    "specialFeatures": ["..."] // DPA, Buydown, etc.
  },
  "monthlyPaymentBreakdown": {
    "principalAndInterest": "...",
    "propertyTax": "...",
    "homeInsurance": "...",
    "mortgageInsurance": "...",
    "hoaDues": "...",
    "dpaPayments": "...",
    "totalMonthlyPayment": "..."
  },
  "cashToClose": {
    "downPayment": "...",
    "closingCosts": "...",
    "credits": "...",
    "dpaAssistance": "...",
    "earnestMoney": "...",
    "netCashToClose": "..."
  },
  "borrowerQualification": {
    "creditScore": "...",
    "totalIncome": "...",
    "monthlyDebts": "...",
    "frontEndDTI": "...",
    "backEndDTI": "...",
    "qualificationStatus": "..."
  },
  "specialFeatures": {
    "dpa": {...},
    "dpa2": {...},
    "buydown": {...},
    "sellerConcessions": "...",
    "lenderCredits": "..."
  },
  "notes": "...", // Formatted professionally from scenario notes
  "missingInformation": [
    {
      "priority": "critical" | "important" | "recommended",
      "category": "...",
      "item": "...",
      "question": "..." // Specific question to ask borrower
    }
  ]
}

IMPORTANT:
- Format all currency values as "$X,XXX"
- Format percentages as "X.XX%"
- Format dates as "Month Day, Year"
- For missing information, be SPECIFIC and ACTIONABLE
- Prioritize missing info: critical (blocks processing), important (needed soon), recommended (helpful)
- Review notes field and extract any relevant information
- If notes are empty or minimal, note that in missingInformation

Return ONLY valid JSON, no markdown, no code blocks, no explanations.`;

    // Call OpenAI API
    let openaiResponse;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an expert mortgage loan processor assistant. Always return valid JSON only, no markdown, no explanations.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 4000,
            response_format: { type: 'json_object' }
          })
        });

        if (openaiResponse.ok || openaiResponse.status !== 429) {
          break;
        }

        if (openaiResponse.status === 429) {
          lastError = 'Rate limit exceeded';
          continue;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        if (attempt === maxRetries - 1) throw error;
      }
    }

    if (!openaiResponse || !openaiResponse.ok) {
      const errorText = await openaiResponse?.text().catch(() => 'Unknown error');
      console.error('OpenAI API Error:', openaiResponse?.status, errorText);
      
      if (openaiResponse?.status === 429) {
        return response.status(429).json({ 
          error: 'Rate limit exceeded. Please wait a moment and try again, or check your OpenAI account limits.',
          retryAfter: 60
        });
      }
      
      return response.status(openaiResponse?.status || 500).json({ 
        error: `OpenAI API error: ${errorText || lastError || 'Unknown error'}` 
      });
    }

    const data = await openaiResponse.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return response.status(500).json({ error: 'No content returned from AI' });
    }

    // Parse JSON response
    let structuredData;
    try {
      structuredData = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      return response.status(500).json({ 
        error: 'Failed to parse AI response. Please try again.',
        rawContent: content.substring(0, 200)
      });
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');
    
    return response.status(200).json(structuredData);

  } catch (error) {
    console.error('Error generating submission PDF data:', error);
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
