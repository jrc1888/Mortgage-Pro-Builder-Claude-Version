import type { VercelRequest, VercelResponse } from '@vercel/node';

interface GoogleSearchResult {
  title: string;
  snippet: string;
  link: string;
}

/**
 * Google Custom Search API helper
 * Returns top 5 search results with title, snippet, and link
 */
async function googleSearch(query: string): Promise<GoogleSearchResult[]> {
  const key = process.env.VITE_GOOGLE_SEARCH_API_KEY;
  const cx = process.env.VITE_GOOGLE_SEARCH_ENGINE_ID;

  if (!key || !cx) {
    throw new Error('Missing VITE_GOOGLE_SEARCH_API_KEY or VITE_GOOGLE_SEARCH_ENGINE_ID in server environment variables.');
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PropertySearch/1.0)'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Google Search API error (${response.status}):`, errorText.substring(0, 200));
      throw new Error(`Google Search API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    // Return top 5 results
    return data.items.slice(0, 5).map((item: any) => ({
      title: item.title || '',
      snippet: item.snippet || '',
      link: item.link || ''
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Google Search API request timed out after 10 seconds');
    }
    throw error;
  }
}

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

  try {
    const { mlsNumber } = request.body;

    if (!mlsNumber || typeof mlsNumber !== 'string') {
      return response.status(400).json({ error: 'MLS number is required' });
    }

    // Check both environment variable names for backward compatibility
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in Vercel environment variables.' });
    }

    // Step 1: Use Google Search to find MLS listing with fallback strategies
    // Prioritize known working sites (utahrealestate.com, redfin.com)
    const searchQueries = [
      `"${mlsNumber}" MLS site:utahrealestate.com`,
      `"${mlsNumber}" MLS site:redfin.com`,
      `MLS ${mlsNumber} site:utahrealestate.com`,
      `MLS ${mlsNumber} site:redfin.com`,
      `"${mlsNumber}" MLS`,
      `MLS ${mlsNumber}`,
      mlsNumber
    ];
    
    let searchResults: GoogleSearchResult[] = [];
    let queryUsed = searchQueries[0];
    
    for (const query of searchQueries) {
      try {
        searchResults = await googleSearch(query);
        if (searchResults.length > 0) {
          queryUsed = query;
          console.log(`MLS search succeeded with query: ${query}`);
          break;
        }
      } catch (error) {
        console.log(`MLS search query failed: ${query}`);
        continue;
      }
    }
    
    if (searchResults.length === 0) {
      return response.status(404).json({ error: `Address not found from MLS search results. Tried queries: ${searchQueries.join(', ')}` });
    }

    // Step 2: Build raw_text from search results
    const topResults = searchResults.slice(0, 3);
    let rawText = '';
    for (const result of topResults) {
      rawText += `Title: ${result.title}\n`;
      rawText += `Snippet: ${result.snippet}\n`;
      rawText += `Link: ${result.link}\n\n`;
    }

    // Step 3: Use OpenAI to extract address from search results
    const instructions = `You are a real estate assistant. Extract the property address from the provided search results.

IMPORTANT RULES:
1. Extract ONLY the address that appears in the search results. Never guess or invent values.
2. If you cannot find an address in the search results, return null.
3. Return the address in format: "[Street Number] [Street Name], [City], [State] [Zip Code]"
4. Example: "626 W Cottle Ln, Farmington, UT 84025"

Return a JSON object with:
- address: Complete property address (or null if not found)
- confidence: Confidence score (0.0 to 1.0) based on how certain you are
- notes: Brief explanation of what was found`;

    const input = `Extract the property address for MLS number ${mlsNumber} from these search results:

${rawText}

Return the complete property address in the format: [Street Number] [Street Name], [City], [State] [Zip Code]

If you cannot find the address in the search results, return null for the address field.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      let errorMessage = 'OpenAI API error';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorText.substring(0, 200);
      } catch {
        errorMessage = errorText.substring(0, 200);
      }
      return response.status(500).json({ error: errorMessage });
    }

    const data = await openaiResponse.json();
    
    // Extract content from Chat Completions response
    let outputText: string;
    if (data.choices && data.choices[0]?.message?.content) {
      outputText = data.choices[0].message.content;
    } else {
      return response.status(500).json({ error: 'No response content found in OpenAI API response' });
    }
    
    // Clean JSON from response (remove markdown code blocks if present)
    let cleanText = outputText.trim();
    cleanText = cleanText.replace(/```json\n?/gi, '');
    cleanText = cleanText.replace(/```\n?/g, '');
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }

    let result: { address: string | null; confidence?: number; notes?: string };
    try {
      result = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw response:', cleanText);
      return response.status(500).json({ error: 'Failed to parse address from OpenAI response' });
    }

    const address = result.address?.trim() || null;

    if (!address || address.toLowerCase() === 'null') {
      return response.status(404).json({ error: 'Address not found from MLS search results' });
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({
      success: true,
      address: address,
      mlsNumber: mlsNumber,
      confidence: result.confidence,
      notes: result.notes
    });

  } catch (error) {
    console.error('Error finding address from MLS:', error);
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

