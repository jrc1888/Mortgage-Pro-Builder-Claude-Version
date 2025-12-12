// FIXED NLP PARSER - Better error handling and API format
// Replace the entire nlpParser.ts file with this:

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
  // Check if API key exists
  if (!geminiApiKey || geminiApiKey.trim() === '') {
    return {
      confidence: 0,
      clarifications: ['Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your environment variables.']
    };
  }

  const prompt = `You are a mortgage scenario data extractor. Parse this natural language description and extract mortgage details.

Input: "${input}"

Extract the following if present:
- Purchase price (number)
- Down payment (as percentage OR dollar amount)
- Loan type (Conventional, FHA, VA, or Jumbo)
- Client name
- Property address
- Interest rate (percentage)
- Credit score
- Property tax (yearly amount)
- HOA fee (monthly amount)

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no extra text.

Format:
{
  "purchasePrice": number or null,
  "downPaymentPercent": number or null,
  "downPaymentAmount": number or null,
  "loanType": "Conventional" | "FHA" | "VA" | "Jumbo" | null,
  "clientName": string or null,
  "propertyAddress": string or null,
  "interestRate": number or null,
  "creditScore": number or null,
  "propertyTaxYearly": number or null,
  "hoaMonthly": number or null,
  "confidence": 0-100,
  "clarifications": ["what additional info is needed?"]
}

Examples:

Input: "500k house, 10% down, FHA, John Smith"
{"purchasePrice":500000,"downPaymentPercent":10,"loanType":"FHA","clientName":"John Smith","confidence":90,"clarifications":["Interest rate?","Property address?"]}

Input: "Jane Doe buying 750000 dollar home with 20 percent down conventional loan at 6.5 percent"
{"purchasePrice":750000,"downPaymentPercent":20,"loanType":"Conventional","clientName":"Jane Doe","interestRate":6.5,"confidence":95,"clarifications":["Property address?"]}

Input: "300k fha john smith"
{"purchasePrice":300000,"loanType":"FHA","clientName":"John Smith","confidence":85,"clarifications":["Down payment amount?","Interest rate?","Property address?"]}

Now parse and return JSON only:`;

  try {
    console.log('🔍 Parsing with Gemini API...');
    console.log('Input:', input);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE"
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API Error:', response.status, errorText);
      
      if (response.status === 400) {
        return {
          confidence: 0,
          clarifications: ['Invalid API request. Please check your Gemini API key is correct.']
        };
      } else if (response.status === 403) {
        return {
          confidence: 0,
          clarifications: ['API key rejected. Please verify your Gemini API key in Vercel environment variables.']
        };
      } else {
        return {
          confidence: 0,
          clarifications: [`API Error (${response.status}). Please try again.`]
        };
      }
    }

    const data = await response.json();
    console.log('📦 Gemini Response:', data);
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.error('❌ No text in response');
      return {
        confidence: 0,
        clarifications: ['No response from AI. Please try rephrasing your input.']
      };
    }
    
    console.log('📝 Raw text:', text);
    
    // Clean up response (remove markdown code blocks if present)
    let cleanText = text.trim();
    
    // Remove markdown code blocks
    cleanText = cleanText.replace(/```json\n?/gi, '');
    cleanText = cleanText.replace(/```\n?/g, '');
    
    // Extract JSON if it's embedded in other text
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    console.log('🧹 Cleaned text:', cleanText);
    
    const parsed = JSON.parse(cleanText);
    console.log('✅ Parsed successfully:', parsed);

    // Ensure we have valid data structure
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
    console.error('❌ NLP Parse Error:', error);
    
    if (error instanceof SyntaxError) {
      return {
        confidence: 0,
        clarifications: ['Failed to parse AI response. Please try rephrasing your input more clearly.']
      };
    }
    
    return {
      confidence: 0,
      clarifications: ['An error occurred. Please check your internet connection and try again.']
    };
  }
};
