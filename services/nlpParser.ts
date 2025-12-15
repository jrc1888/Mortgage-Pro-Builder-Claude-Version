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
  _apiKey?: string // Not used anymore - API key is server-side
): Promise<ParsedScenarioData> => {
  
  console.log('🤖 NLP Parser Starting...');
  console.log('📝 Input:', input);

  try {
    console.log('📡 Calling Vercel API proxy...');
    
    // Call our Vercel serverless function instead of OpenAI directly
    // This avoids CORS issues
    const apiUrl = '/api/ai-parse';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input })
    });

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ API Error:', errorData);
      
      if (response.status === 401) {
        return {
          confidence: 0,
          clarifications: ['ERROR 401: Invalid API key. Check your OpenAI API key in Vercel settings.']
        };
      } else if (response.status === 400) {
        return {
          confidence: 0,
          clarifications: ['ERROR 400: Invalid API request. ' + (errorData.error || '')]
        };
      } else if (response.status === 429) {
        return {
          confidence: 0,
          clarifications: ['ERROR 429: Rate limit exceeded. This usually means you\'ve made too many requests too quickly. Please wait 30-60 seconds and try again. If this persists, check your OpenAI account limits at platform.openai.com']
        };
      } else if (response.status === 500) {
        return {
          confidence: 0,
          clarifications: ['ERROR: ' + (errorData.error || 'Server error. Check Vercel environment variables.')]
        };
      }
      
      return {
        confidence: 0,
        clarifications: [`ERROR ${response.status}: ${errorData.error || 'Unknown error'}`]
      };
    }

    const parsed = await response.json();
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
    
    // Handle network errors (CORS, fetch failures, etc.)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        confidence: 0,
        clarifications: ['ERROR: Network error. Make sure you are deployed on Vercel and the API route is accessible.']
      };
    }
    
    return {
      confidence: 0,
      clarifications: [`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`]
    };
  }
};
