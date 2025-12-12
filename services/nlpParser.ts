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
  geminiApiKey: string
): Promise<ParsedScenarioData> => {
  
  console.log('🤖 NLP Parser Starting...');
  console.log('📝 Input:', input);
  console.log('🔑 API Key:', geminiApiKey ? `${geminiApiKey.substring(0, 10)}...` : 'MISSING');

  // Validate API key
  if (!geminiApiKey || geminiApiKey.trim() === '') {
    console.error('❌ No API key provided');
    return {
      confidence: 0,
      clarifications: ['ERROR: Gemini API key not configured. Add VITE_GEMINI_API_KEY to Vercel environment variables.']
    };
  }

  const prompt = `Extract mortgage scenario data from this text. Return ONLY valid JSON, no markdown, no code blocks.

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

Now parse and return JSON only:`;

  try {
    console.log('📡 Calling Gemini API...');
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      
      if (response.status === 404) {
        return {
          confidence: 0,
          clarifications: ['ERROR 404: Invalid API endpoint. Check Gemini API configuration.']
        };
      } else if (response.status === 400) {
        return {
          confidence: 0,
          clarifications: ['ERROR 400: Invalid API request. Check your Gemini API key in Vercel settings.']
        };
      } else if (response.status === 403) {
        return {
          confidence: 0,
          clarifications: ['ERROR 403: API key rejected. Verify VITE_GEMINI_API_KEY in Vercel is correct.']
        };
      }
      
      return {
        confidence: 0,
        clarifications: [`ERROR ${response.status}: ${errorText.substring(0, 100)}`]
      };
    }

    const data = await response.json();
    console.log('📦 Full response:', JSON.stringify(data, null, 2));
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
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
