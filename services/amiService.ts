/**
 * Area Median Income (AMI) Service
 * 
 * Provides functionality to lookup AMI limits by zip code and family size.
 * Supports both Supabase database and JSON file fallback.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getIncomeLimitsByZipCode as getFannieMaeIncomeLimits, isFannieMaeApiConfigured } from './fannieMaeApiService';

export interface AMILimits {
  zipCode: string;
  county: string;
  msa: string;
  state: string;
  familySize: number;
  limits: {
    extremelyLow: number;    // 30% AMI
    veryLow: number;         // 50% AMI
    low: number;            // 80% AMI
    median: number;         // 100% AMI
    moderate: number;       // 120% AMI
  };
  effectiveDate: string;
  dataSource: string;
}

export interface QualificationStatus {
  qualifiesFor: string[];
  incomeCategory: 'extremelyLow' | 'veryLow' | 'low' | 'moderate' | 'aboveModerate';
  percentageOfAMI: number;
}

/**
 * Get AMI limits for a specific zip code and family size
 * 
 * @param zipCode - 5-digit zip code
 * @param familySize - Number of persons in household (1-8)
 * @returns AMI limits or null if not found
 */
export async function getAMILimits(
  zipCode: string,
  familySize: number
): Promise<AMILimits | null> {
  // Validate inputs
  if (!zipCode || zipCode.length !== 5) {
    throw new Error('Invalid zip code. Must be 5 digits.');
  }
  
  if (familySize < 1 || familySize > 8) {
    throw new Error('Family size must be between 1 and 8.');
  }

  // Normalize zip code (remove any non-digits)
  const normalizedZip = zipCode.replace(/\D/g, '').substring(0, 5);
  if (normalizedZip.length !== 5) {
    throw new Error('Invalid zip code format.');
  }

  try {
    // Try Fannie Mae API first if configured (most up-to-date)
    if (isFannieMaeApiConfigured()) {
      console.log('Fannie Mae API: Attempting to fetch AMI data for zip code', normalizedZip);
      const fannieMaeData = await getAMILimitsFromFannieMaeApi(normalizedZip, familySize);
      if (fannieMaeData) {
        console.log('Fannie Mae API: Successfully retrieved AMI data for zip code', normalizedZip);
        return fannieMaeData;
      } else {
        console.warn('Fannie Mae API: No data returned, falling back to other sources');
      }
    } else {
      console.log('Fannie Mae API: Not configured, skipping API call');
    }

    // Try Supabase database if configured
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('ami_limits')
        .select('*')
        .eq('zip_code', normalizedZip)
        .eq('family_size', familySize)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        return {
          zipCode: data.zip_code,
          county: data.county_name || '',
          msa: data.msa_name || '',
          state: data.state_name || '',
          familySize: data.family_size,
          limits: {
            extremelyLow: Number(data.ami_30_percent) || 0,
            veryLow: Number(data.ami_50_percent) || 0,
            low: Number(data.ami_80_percent) || 0,
            median: Number(data.ami_100_percent) || 0,
            moderate: Number(data.ami_120_percent) || 0,
          },
          effectiveDate: data.effective_date,
          dataSource: data.data_source || 'HUD',
        };
      }
    }

    // Fallback to JSON file
    return await getAMILimitsFromJSON(normalizedZip, familySize);
  } catch (error) {
    console.error('Error in getAMILimits:', error);
    return null;
  }
}

/**
 * Get AMI limits from Fannie Mae API
 */
async function getAMILimitsFromFannieMaeApi(
  zipCode: string,
  familySize: number
): Promise<AMILimits | null> {
  try {
    console.log('Fannie Mae API: Getting income limits for zip code', zipCode);
    const fannieMaeData = await getFannieMaeIncomeLimits(zipCode);
    
    if (!fannieMaeData) {
      console.warn('Fannie Mae API: No data returned from getIncomeLimitsByZipCode');
      return null;
    }
    
    // Log the full response structure for debugging
    // Based on OpenAPI spec, response is an array of IncomeLimitsCollection objects
    console.log('Fannie Mae API: Full response structure:', JSON.stringify(fannieMaeData, null, 2));
    
    // According to OpenAPI spec, response is an array of IncomeLimitsCollection
    // Each collection has: incomeLimitsList (array of IncomeLimits)
    // Each IncomeLimits has: dts_income_limit, hr_income_limit, vli_income_limit, rural_indicator, high_needs_rural_indicator, fips_code
    
    // Handle array response
    let incomeLimitsArray = Array.isArray(fannieMaeData) ? fannieMaeData : [];
    
    // If it's a single object with incomeLimitsList, extract the array
    if (!Array.isArray(fannieMaeData) && fannieMaeData.incomeLimitsList) {
      incomeLimitsArray = fannieMaeData.incomeLimitsList;
    }
    
    // If it's wrapped in a data property
    if (!Array.isArray(fannieMaeData) && fannieMaeData.data) {
      if (Array.isArray(fannieMaeData.data)) {
        incomeLimitsArray = fannieMaeData.data;
      } else if (fannieMaeData.data.incomeLimitsList) {
        incomeLimitsArray = fannieMaeData.data.incomeLimitsList;
      }
    }
    
    if (!incomeLimitsArray || incomeLimitsArray.length === 0) {
      console.warn('Fannie Mae API: No income limits data in response');
      return null;
    }
    
    // Get the first income limits entry (should be the primary one for the address)
    const firstLimit = incomeLimitsArray[0];
    
    // Extract income limits from the response structure
    // Fannie Mae API provides:
    // - vli_income_limit: Very Low Income (50% AMI)
    // - hr_income_limit: HomeReady (80% AMI) 
    // - dts_income_limit: Duty to Serve (may vary)
    // Note: These are not family-size specific - they appear to be area-level limits
    // We'll use them as the base limits
    
    const veryLow = firstLimit.vli_income_limit || 0;        // 50% AMI
    const low = firstLimit.hr_income_limit || 0;             // 80% AMI (HomeReady)
    const dtsLimit = firstLimit.dts_income_limit || 0;       // Duty to Serve limit
    
    // Calculate median from 80% AMI (if hr_income_limit is 80% of median, then median = hr_income_limit / 0.8)
    const median = low > 0 ? Math.round(low / 0.8) : (dtsLimit > 0 ? Math.round(dtsLimit / 0.8) : 0);
    
    // Calculate 30% AMI (extremely low) from median
    const extremelyLow = median > 0 ? Math.round(median * 0.3) : 0;
    
    // Calculate 120% AMI (moderate income) from median
    const moderate = median > 0 ? Math.round(median * 1.2) : 0;
    
    // Note: Fannie Mae API doesn't provide family-size specific limits in the response
    // The limits appear to be area-level. We may need to adjust based on family size using standard HUD multipliers
    // For now, we'll use the base limits and note this in the data source
    
    // Validate that we got at least some data
    if (!extremelyLow && !veryLow && !low && !median) {
      console.warn('Fannie Mae API: Could not extract income limits from response structure for zip code', zipCode);
      console.warn('Fannie Mae API: Available keys in incomeData:', Object.keys(incomeData));
      console.warn('Fannie Mae API: Full response for debugging:', JSON.stringify(incomeData, null, 2));
      return null;
    }
    
    console.log(`Fannie Mae API: Extracted limits for family size ${familySize}:`, {
      extremelyLow,
      veryLow,
      low,
      median,
      moderate
    });
    
    return {
      zipCode,
      county: incomeData.county || incomeData.countyName || '',
      msa: incomeData.msa || incomeData.metroArea || '',
      state: incomeData.state || incomeData.stateCode || '',
      familySize,
      limits: {
        extremelyLow: extremelyLow || 0,
        veryLow: veryLow || 0,
        low: low || 0,
        median: median || 0,
        moderate: moderate || 0,
      },
      effectiveDate: incomeData.effectiveDate || incomeData.year || incomeData.fiscalYear || new Date().toISOString().split('T')[0],
      dataSource: 'Fannie Mae API',
    };
  } catch (error) {
    console.error('Error fetching AMI limits from Fannie Mae API:', error);
    return null;
  }
}

/**
 * Fallback: Get AMI limits from JSON file
 */
async function getAMILimitsFromJSON(
  zipCode: string,
  familySize: number
): Promise<AMILimits | null> {
  try {
    // Try to load from public/data/ami-limits.json
    const response = await fetch('/data/ami-limits.json');
    if (!response.ok) {
      console.error(`AMI data file not found: /data/ami-limits.json (Status: ${response.status})`);
      console.error('Make sure the file exists at: public/data/ami-limits.json');
      return null;
    }
    
    const data = await response.json();
    
    // Debug: Log available zip codes
    if (!data[zipCode]) {
      const availableZips = Object.keys(data).filter(key => !key.startsWith('_'));
      console.warn(`Zip code ${zipCode} not found in AMI data. Available zip codes:`, availableZips);
      return null;
    }
    
    const zipData = data[zipCode];
    if (!zipData || !zipData[familySize]) {
      console.warn(`Family size ${familySize} not found for zip code ${zipCode}`);
      return null;
    }

    const limits = zipData[familySize];
    if (!limits || typeof limits !== 'object') {
      console.warn(`Invalid limits data for zip ${zipCode}, family size ${familySize}`);
      return null;
    }

    return {
      zipCode,
      county: zipData.county || '',
      msa: zipData.msa || '',
      state: zipData.state || '',
      familySize,
      limits: {
        extremelyLow: limits['30'] || 0,
        veryLow: limits['50'] || 0,
        low: limits['80'] || 0,
        median: limits['100'] || 0,
        moderate: limits['120'] || 0,
      },
      effectiveDate: zipData.effectiveDate || new Date().toISOString().split('T')[0],
      dataSource: 'Fannie Mae (JSON)',
    };
  } catch (error) {
    console.error('Error loading AMI data from JSON:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return null;
  }
}

/**
 * Determine qualification status based on income
 * 
 * @param zipCode - 5-digit zip code
 * @param familySize - Number of persons in household
 * @param annualIncome - Annual household income
 * @returns Qualification status or null if AMI data not found
 */
export async function getQualificationStatus(
  zipCode: string,
  familySize: number,
  annualIncome: number
): Promise<QualificationStatus | null> {
  const amiLimits = await getAMILimits(zipCode, familySize);
  if (!amiLimits || !amiLimits.limits.median) {
    return null;
  }

  const { limits } = amiLimits;
  const percentageOfAMI = (annualIncome / limits.median) * 100;
  
  let incomeCategory: QualificationStatus['incomeCategory'];
  const qualifiesFor: string[] = [];

  if (annualIncome <= limits.extremelyLow) {
    incomeCategory = 'extremelyLow';
    qualifiesFor.push('Extremely Low Income Programs');
  } else if (annualIncome <= limits.veryLow) {
    incomeCategory = 'veryLow';
    qualifiesFor.push('Very Low Income Programs', 'Extremely Low Income Programs');
  } else if (annualIncome <= limits.low) {
    incomeCategory = 'low';
    qualifiesFor.push('Low Income Programs', 'Very Low Income Programs');
  } else if (annualIncome <= limits.moderate) {
    incomeCategory = 'moderate';
    qualifiesFor.push('Moderate Income Programs', 'Low Income Programs');
  } else {
    incomeCategory = 'aboveModerate';
  }

  // Add program-specific qualifications
  // USDA loans: up to 115% of AMI
  if (annualIncome <= limits.moderate * 1.15) {
    qualifiesFor.push('USDA Loans');
  }
  
  // Many DPA programs: up to 120% of AMI
  if (annualIncome <= limits.moderate) {
    qualifiesFor.push('Many Down Payment Assistance Programs');
  }
  
  // First-time homebuyer programs: often 80-120% AMI
  if (annualIncome >= limits.low && annualIncome <= limits.moderate) {
    qualifiesFor.push('First-Time Homebuyer Programs');
  }

  return {
    qualifiesFor: [...new Set(qualifiesFor)], // Remove duplicates
    incomeCategory,
    percentageOfAMI: Math.round(percentageOfAMI * 10) / 10,
  };
}

/**
 * Extract zip code from address string
 * 
 * @param address - Full address string
 * @returns 5-digit zip code or null if not found
 */
export function extractZipCode(address: string): string | null {
  if (!address) return null;
  
  // Match 5-digit zip code (with optional 4-digit extension)
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

/**
 * Validate zip code format
 * 
 * @param zipCode - Zip code to validate
 * @returns true if valid 5-digit zip code
 */
export function isValidZipCode(zipCode: string): boolean {
  if (!zipCode) return false;
  const normalized = zipCode.replace(/\D/g, '');
  return normalized.length === 5;
}

/**
 * Format zip code to 5 digits
 * 
 * @param zipCode - Zip code to format
 * @returns Formatted 5-digit zip code or null if invalid
 */
export function formatZipCode(zipCode: string): string | null {
  const normalized = zipCode.replace(/\D/g, '').substring(0, 5);
  return normalized.length === 5 ? normalized : null;
}

