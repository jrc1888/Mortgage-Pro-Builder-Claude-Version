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
    const { userGoals, refinanceData } = request.body;

    if (!userGoals || typeof userGoals !== 'string') {
      return response.status(400).json({ error: 'User goals text is required' });
    }

    if (!refinanceData || typeof refinanceData !== 'object') {
      return response.status(400).json({ error: 'Refinance data is required' });
    }

    // Extract key data points from refinance analysis (only actual data, no hallucinations)
    const dataSummary = {
      currentLoan: {
        monthlyPayment: refinanceData.currentMonthlyPayment || 0,
        interestRate: refinanceData.currentInterestRate || 0,
        remainingBalance: refinanceData.currentBalance || 0,
        remainingTerm: refinanceData.remainingTermMonths || 0
      },
      newLoan: {
        monthlyPayment: refinanceData.newMonthlyPayment || 0,
        interestRate: refinanceData.newInterestRate || 0,
        loanAmount: refinanceData.newLoanAmount || 0,
        termMonths: refinanceData.newTermMonths || 0
      },
      savings: {
        monthlySavings: refinanceData.monthlySavings || 0,
        totalInterestSavings: refinanceData.totalInterestSavings || 0,
        breakEvenMonths: refinanceData.breakEvenMonths || null
      },
      cashFlow: {
        cashToClose: refinanceData.cashToClose || 0,
        cashBack: refinanceData.cashBack || 0
      },
      prepayment: {
        acceleratedTermMonths: refinanceData.acceleratedTermMonths || null,
        acceleratedInterestSavings: refinanceData.acceleratedInterestSavings || null
      }
    };

    const prompt = `You are analyzing a refinance scenario for a mortgage loan. Your task is to parse the user's goals and create structured instructions for how to customize a PDF report.

USER GOALS: "${userGoals}"

ACTUAL REFINANCE DATA (ONLY USE THESE NUMBERS - DO NOT MAKE UP ANY VALUES):
${JSON.stringify(dataSummary, null, 2)}

CRITICAL RULES:
1. You MUST ONLY reference the actual data provided above. DO NOT invent, estimate, or assume any numbers.
2. If a data point is missing (null or 0), you cannot reference it.
3. Parse the user goals to identify:
   - Primary focus areas (e.g., "monthly savings", "interest reduction", "cash flow", "payoff speed")
   - Key metrics to emphasize
   - Tone/style preferences (e.g., "conservative", "aggressive", "educational")
   - Specific concerns or priorities mentioned
4. Return structured instructions that will guide PDF customization

Return ONLY valid JSON in this exact format:
{
  "focusAreas": ["area1", "area2"], // e.g., ["monthly_savings", "interest_reduction"]
  "emphasizeMetrics": ["metric1", "metric2"], // e.g., ["monthly_savings", "break_even"]
  "tone": "professional|conservative|aggressive|educational",
  "customSections": ["section1", "section2"], // e.g., ["prepayment_strategy", "cash_flow_analysis"]
  "keyMessages": ["message1", "message2"], // Brief messages to highlight (using ONLY actual data)
  "dataHighlights": {
    "metric_name": "brief description using actual numbers"
  },
  "skipSections": ["section1"], // Sections to de-emphasize or skip if not relevant
  "priority": "high|medium|low" // Overall priority level
}

Example response (using actual data):
{
  "focusAreas": ["monthly_savings", "break_even"],
  "emphasizeMetrics": ["monthly_savings", "break_even_months"],
  "tone": "professional",
  "customSections": ["monthly_savings_breakdown"],
  "keyMessages": ["Save $250/month", "Break even in 24 months"],
  "dataHighlights": {
    "monthly_savings": "Save $250 per month on your mortgage payment",
    "break_even": "Break even point reached in 24 months"
  },
  "skipSections": [],
  "priority": "high"
}

Return ONLY the JSON object, nothing else:`;

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
          temperature: 0.3, // Lower temperature for more consistent, data-focused responses
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

    const parsed = JSON.parse(cleanText);

    // Validate that parsed instructions don't reference non-existent data
    // This is a safety check to prevent hallucinations
    const validMetrics = [
      'monthly_savings', 'break_even_months', 'total_interest_savings',
      'cash_to_close', 'cash_back', 'monthly_payment', 'interest_rate'
    ];
    
    if (parsed.emphasizeMetrics) {
      parsed.emphasizeMetrics = parsed.emphasizeMetrics.filter((m: string) => 
        validMetrics.includes(m) || m.startsWith('custom_')
      );
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json(parsed);

  } catch (error) {
    console.error('Parse Refi Goals Error:', error);
    
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

