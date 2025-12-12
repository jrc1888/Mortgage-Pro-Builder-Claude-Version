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
  const prompt = `
You are a mortgage scenario data extractor. Parse this natural language description and extract mortgage details.

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

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
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
Output: {"purchasePrice":500000,"downPaymentPercent":10,"loanType":"FHA","clientName":"John Smith","confidence":90,"clarifications":["What interest rate?","Property address?"]}

Input: "Jane Doe buying 750000 dollar home with 20 percent down conventional loan at 6.5 percent"
Output: {"purchasePrice":750000,"downPaymentPercent":20,"loanType":"Conventional","clientName":"Jane Doe","interestRate":6.5,"confidence":95,"clarifications":["Property address?"]}

Input: "400k purchase, VA loan, Bob Johnson, 7% rate, 720 credit"
Output: {"purchasePrice":400000,"loanType":"VA","clientName":"Bob Johnson","interestRate":7,"creditScore":720,"downPaymentPercent":0,"confidence":95,"clarifications":["Property address?"]}

Now parse the user's input and return JSON only, no other text.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates[0]?.content?.parts[0]?.text || '{}';
    
    // Clean up response (remove markdown code blocks if present)
    const cleanText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^[^{]*({.*})[^}]*$/s, '$1')
      .trim();
    
    const parsed = JSON.parse(cleanText);

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
      confidence: parsed.confidence || 0,
      clarifications: parsed.clarifications || []
    };
  } catch (error) {
    console.error('NLP Parse Error:', error);
    return {
      confidence: 0,
      clarifications: ['Failed to parse. Please try rephrasing or check your Gemini API key.']
    };
  }
};
