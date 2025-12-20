/**
 * Area Median Income (AMI) Service
 * 
 * Provides functionality to lookup AMI limits by zip code and family size.
 * Supports both Supabase database and JSON file fallback.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

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
    // Try Supabase first if configured
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
 * Fallback: Get AMI limits from JSON file
 * This is a placeholder - you'll need to create the actual JSON file
 */
async function getAMILimitsFromJSON(
  zipCode: string,
  familySize: number
): Promise<AMILimits | null> {
  try {
    // Try to load from public/data/ami-limits.json
    const response = await fetch('/data/ami-limits.json');
    if (!response.ok) {
      // File doesn't exist yet - return null
      return null;
    }
    
    const data = await response.json();
    
    const zipData = data[zipCode];
    if (!zipData || !zipData[familySize]) {
      return null;
    }

    const limits = zipData[familySize];
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
      dataSource: 'HUD (JSON)',
    };
  } catch (error) {
    console.error('Error loading AMI data from JSON:', error);
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

