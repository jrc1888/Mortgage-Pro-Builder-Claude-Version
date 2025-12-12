import { GoogleGenAI } from "@google/genai";
import { Scenario, CalculatedResults } from '../types';

const getApiKey = () => {
  // Try import.meta.env (Vite Standard)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_AI_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_GOOGLE_AI_KEY;
    }
  } catch (e) {}
  
  return "";
}

export const analyzeScenario = async (scenario: Scenario, results: CalculatedResults): Promise<string> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return "API Key missing. Please set VITE_GOOGLE_AI_KEY in your Vercel Environment Variables.";
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Act as a senior mortgage underwriter and financial advisor. 
    Analyze the following mortgage scenario for a client.
    
    Data:
    ${JSON.stringify({ scenario, results }, null, 2)}
    
    Provide a concise analysis focusing on:
    1. Debt-to-Income impact (assuming typical income, just general advice on payment comfort).
    2. The efficiency of the loan structure (e.g. is the Buydown worth the cost? Is the MI too high?).
    3. If FHA/VA vs Conventional choice looks appropriate based on the LTV.
    4. Specific advice on the Down Payment Assistance if active.

    Format the output with bold headings and bullet points using Markdown. Keep it under 250 words.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Unable to generate analysis. Please verify your API Key quota and permissions.";
  }
};