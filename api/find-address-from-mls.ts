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
    console.error('Missing Google Search API credentials');
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
      console.error(`Query was: ${query}`);
      throw new Error(`Google Search API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      console.log(`Google Search returned 0 results for query: ${query}`);
      console.log(`Response data:`, JSON.stringify(data).substring(0, 200));
      return [];
    }

    console.log(`Google Search returned ${data.items.length} results for query: ${query}`);
    // Return top 5 results
    return data.items.slice(0, 5).map((item: any) => ({
      title: item.title || '',
      snippet: item.snippet || '',
      link: item.link || ''
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Google Search timed out for query: ${query}`);
      throw new Error('Google Search API request timed out after 10 seconds');
    }
    console.error(`Google Search error for query: ${query}`, error);
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

    console.log(`\n${'='.repeat(60)}`);
    console.log(`MLS LOOKUP REQUEST`);
    console.log(`MLS Number: ${mlsNumber}`);
    console.log(`${'='.repeat(60)}\n`);

    // Check both environment variable names for backward compatibility
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in Vercel environment variables.' });
    }

    // Step 1: Use Google Search to find MLS listing with SIMPLIFIED queries
    // MUCH simpler approach - no complex operators
    const searchQueries = [
      // Super simple queries first
      `MLS ${mlsNumber}`,
      `${mlsNumber} MLS`,
      `MLS ${mlsNumber} Utah`,
      `${mlsNumber} property listing`,
      // Then try specific sites with simple format
      `MLS ${mlsNumber} site:utahrealestate.com`,
      `MLS ${mlsNumber} site:redfin.com`,
      `MLS ${mlsNumber} site:homes.com`,
      `MLS ${mlsNumber} site:zillow.com`,
      // Last resort - just the number
      mlsNumber
    ];
    
    console.log(`Will try ${searchQueries.length} search queries...`);
    
    let allSearchResults: GoogleSearchResult[] = [];
    
    for (let i = 0; i < searchQueries.length; i++) {
      const query = searchQueries[i];
      try {
        console.log(`[${i + 1}/${searchQueries.length}] Trying query: "${query}"`);
        const results = await googleSearch(query);
        console.log(`  → Got ${results.length} results`);
        
        // Add unique results
        for (const result of results) {
          if (!allSearchResults.some(r => r.link === result.link)) {
            allSearchResults.push(result);
          }
        }
        
        // If we have enough results, stop early
        if (allSearchResults.length >= 10) {
          console.log(`Collected ${allSearchResults.length} total results, stopping early`);
          break;
        }
      } catch (error) {
        console.log(`  ✗ Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        continue;
      }
    }
    
    if (allSearchResults.length === 0) {
      console.log(`\n❌ MLS LOOKUP FAILED - Zero results from all queries`);
      return response.status(404).json({ 
        error: `Address not found from MLS search results. Tried ${searchQueries.length} queries. Google Search may be misconfigured or rate limited.`,
        searchQueries: searchQueries,
        googleSearchWorking: false
      });
    }

    console.log(`\nTotal search results collected: ${allSearchResults.length}`);

    // Step 2: Build raw_text from search results
    const topResults = allSearchResults.slice(0, 5);
    let rawText = '';
    for (const result of topResults) {
      rawText += `Title: ${result.title}\n`;
      rawText += `Snippet: ${result.snippet}\n`;
      rawText += `Link: ${result.link}\n\n`;
    }

    console.log(`\nBuilt search results text (${rawText.length} chars)`);

    // Step 3: Use OpenAI to extract address from search results
    const instructions = `You are a real estate assistant. Extract the property address from the provided search results for MLS number ${mlsNumber}.

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

    console.log(`\nCalling OpenAI to extract address...`);

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
      console.error(`\n❌ OpenAI API error:`, errorMessage);
      return response.status(500).json({ error: errorMessage });
    }

    const data = await openaiResponse.json();
    
    // Extract content from Chat Completions response
    let outputText: string;
    if (data.choices && data.choices[0]?.message?.content) {
      outputText = data.choices[0].message.content;
    } else {
      console.error(`\n❌ No response content from OpenAI`);
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
      console.log(`\n❌ MLS LOOKUP FAILED - Address not found in search results`);
      console.log(`OpenAI notes: ${result.notes}`);
      return response.status(404).json({ 
        error: 'Address not found from MLS search results. OpenAI could not extract an address from the search results.',
        notes: result.notes,
        searchResultsFound: allSearchResults.length
      });
    }

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    console.log(`\n✓ MLS LOOKUP SUCCESS`);
    console.log(`Found address: ${address}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`${'='.repeat(60)}\n`);

    return response.status(200).json({
      success: true,
      address: address,
      mlsNumber: mlsNumber,
      confidence: result.confidence,
      notes: result.notes,
      searchResultsFound: allSearchResults.length
    });

  } catch (error) {
    console.error('\n❌ MLS LOOKUP ERROR:', error);
    console.log(`${'='.repeat(60)}\n`);
    return response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
