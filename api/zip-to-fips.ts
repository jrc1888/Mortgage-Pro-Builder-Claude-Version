import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Convert ZIP code to FIPS code (11-digit census tract FIPS)
 * Uses US Census Bureau Geocoding API
 */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return response.status(200).end();
  }

  // Only allow GET requests
  if (request.method !== 'GET') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const zipCode = request.query.zipCode as string;

    if (!zipCode || zipCode.length !== 5) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(400).json({ error: 'Valid 5-digit zip code is required' });
    }

    // Use US Census Bureau Geocoding API to get FIPS code from ZIP
    // This is a free public API that doesn't require authentication
    const geocodeUrl = `https://geocoding.geo.census.gov/geocoder/geographies/address?street=1+Main+St&city=City&state=UT&zip=${zipCode}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    
    console.log('ZIP to FIPS: Fetching from Census Bureau:', geocodeUrl);

    const geocodeResponse = await fetch(geocodeUrl);

    if (!geocodeResponse.ok) {
      console.error('Census Bureau API Error:', geocodeResponse.status);
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(500).json({ 
        error: 'Failed to geocode ZIP code',
        details: 'Census Bureau API returned an error'
      });
    }

    const geocodeData = await geocodeResponse.json();
    
    // Extract FIPS code from response
    // Response structure: result.addressMatches[0].geographies['Census Tracts'][0].GEOID
    let fipsCode: string | null = null;

    if (geocodeData.result && geocodeData.result.addressMatches && geocodeData.result.addressMatches.length > 0) {
      const match = geocodeData.result.addressMatches[0];
      if (match.geographies && match.geographies['Census Tracts'] && match.geographies['Census Tracts'].length > 0) {
        fipsCode = match.geographies['Census Tracts'][0].GEOID;
      }
    }

    if (!fipsCode || fipsCode.length < 11) {
      // Fallback: Try using a geocoding service or return error
      console.warn('ZIP to FIPS: Could not extract FIPS code from Census Bureau response');
      response.setHeader('Access-Control-Allow-Origin', '*');
      return response.status(404).json({ 
        error: `Could not find FIPS code for ZIP code ${zipCode}`,
        details: 'The ZIP code may not be valid or the geocoding service may be unavailable',
        suggestion: 'Try using a full address instead'
      });
    }

    console.log('ZIP to FIPS: Successfully converted', zipCode, 'to FIPS', fipsCode);

    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');

    return response.status(200).json({
      zipCode,
      fipsCode,
      // Extract state and county FIPS for reference
      stateFips: fipsCode.substring(0, 2),
      countyFips: fipsCode.substring(0, 5),
    });

  } catch (error) {
    console.error('ZIP to FIPS Error:', error);
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    
    return response.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: 'Failed to convert ZIP code to FIPS code'
    });
  }
}

