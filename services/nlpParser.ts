import { LoanType } from '../types';

export interface ParsedScenarioData {
  purchasePrice?: number;
  downPaymentPercent?: number;
  downPaymentAmount?: number;
  loanType?: LoanType;
  clientName?: string;
  propertyAddress?: string;
  interestRate?: number;
  creditScore?: number;
  propertyTaxYearly?: number;
  hoaMonthly?: number;
  confidence: number;
  clarifications: string[];
}

export const parseNaturalLanguage = async (
  input: string,
  apiKey: string
): Promise<ParsedScenarioData> => {
  
  console.log('🤖 NLP Parser Starting...');
  console.log('📝 Input:', input);
  console.log('🔑 API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');

  // Validate API key
  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ No API key provided');
    return {
      confidence: 0,
      clarifications: ['ERROR: Claude API key not configured. Add VITE_CLAUDE_API_KEY to Vercel environment variables.']
    };
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

  try {
    console.log('📡 Calling Claude API...');
    
    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
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
      }
    );

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      
      if (response.status === 401) {
        return {
          confidence: 0,
          clarifications: ['ERROR 401: Invalid API key. Check your Claude API key in Vercel settings.']
        };
      } else if (response.status === 400) {
        return {
          confidence: 0,
          clarifications: ['ERROR 400: Invalid API request. Check your Claude API key format.']
        };
      } else if (response.status === 429) {
        return {
          confidence: 0,
          clarifications: ['ERROR 429: Rate limit exceeded. Please try again in a moment.']
        };
      }
      
      return {
        confidence: 0,
        clarifications: [`ERROR ${response.status}: ${errorText.substring(0, 100)}`]
      };
    }

    const data = await response.json();
    console.log('📦 Full response:', JSON.stringify(data, null, 2));
    
    const text = data.content?.[0]?.text;
    
    if (!text) {
      console.error('❌ No text in response');
      return {
        confidence: 0,
        clarifications: ['ERROR: No response from AI. Try rephrasing your input.']
      };
    }
    
    console.log('📝 Raw AI response:', text);
    
    // Clean JSON from response
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json\n?/gi, '');
    cleanText = cleanText.replace(/```\n?/g, '');
    
    // Extract JSON object
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    console.log('🧹 Cleaned JSON:', cleanText);
    
    const parsed = JSON.parse(cleanText);
    console.log('✅ Parsed successfully:', parsed);

    return {
      purchasePrice: parsed.purchasePrice || undefined,
      downPaymentPercent: parsed.downPaymentPercent || undefined,
      downPaymentAmount: parsed.downPaymentAmount || undefined,
      loanType: parsed.loanType || undefined,
      clientName: parsed.clientName || undefined,
      propertyAddress: parsed.propertyAddress || undefined,
      interestRate: parsed.interestRate || undefined,
      creditScore: parsed.creditScore || undefined,
      propertyTaxYearly: parsed.propertyTaxYearly || undefined,
      hoaMonthly: parsed.hoaMonthly || undefined,
      confidence: parsed.confidence || 50,
      clarifications: parsed.clarifications || []
    };
    
  } catch (error) {
    console.error('❌ Parse Error:', error);
    
    if (error instanceof SyntaxError) {
      return {
        confidence: 0,
        clarifications: ['ERROR: Could not parse AI response. Try simpler phrasing like "300k house fha john smith".']
      };
    }
    
    return {
      confidence: 0,
      clarifications: [`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`]
    };
  }
};
