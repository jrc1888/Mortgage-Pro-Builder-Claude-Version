# AMI Module Implementation Guide

## Quick Start Implementation Plan

This guide provides step-by-step instructions for implementing the AMI lookup module in the Mortgage Pro Builder application.

## Phase 1: Data Preparation (Do This First)

### Step 1.1: Download HUD Income Limits Data

1. Visit: https://www.huduser.gov/portal/datasets/il.html
2. Download the latest "FY2024 Income Limits" CSV file
3. File will be named something like: `FY2024_IL_50_Rev.csv`
4. Save to project root as `data/hud-income-limits.csv`

### Step 1.2: Download Zip Code to County Crosswalk

**Option A: Use Census Bureau Data**
- Visit: https://www.census.gov/geographies/reference-files.html
- Download ZCTA to County Relationship File
- Or use: https://www.huduser.gov/portal/datasets/usps_crosswalk.html

**Option B: Use Commercial API (Easier)**
- SmartyStreets API (free tier available)
- Google Geocoding API
- Or use a pre-built crosswalk file

### Step 1.3: Create Data Processing Script

Create `scripts/process-ami-data.ts` to:
1. Read HUD CSV
2. Read zip code crosswalk
3. Merge datasets
4. Generate JSON output for app

## Phase 2: Data Storage Options

### Option A: Supabase Table (Recommended)

Run this SQL in Supabase SQL Editor:

```sql
-- Create AMI limits table
CREATE TABLE IF NOT EXISTS ami_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zip_code VARCHAR(5) NOT NULL,
  county_name VARCHAR(255),
  county_fips VARCHAR(5),
  msa_code VARCHAR(10),
  msa_name VARCHAR(255),
  state_code VARCHAR(2),
  state_name VARCHAR(100),
  family_size INTEGER NOT NULL CHECK (family_size >= 1 AND family_size <= 8),
  ami_30_percent DECIMAL(10,2),
  ami_50_percent DECIMAL(10,2),
  ami_80_percent DECIMAL(10,2),
  ami_100_percent DECIMAL(10,2),
  ami_120_percent DECIMAL(10,2),
  effective_date DATE NOT NULL,
  data_source VARCHAR(100) DEFAULT 'HUD',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(zip_code, family_size, effective_date)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ami_zip_family ON ami_limits(zip_code, family_size);
CREATE INDEX IF NOT EXISTS idx_ami_zip ON ami_limits(zip_code);
CREATE INDEX IF NOT EXISTS idx_ami_effective_date ON ami_limits(effective_date DESC);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE ami_limits ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all reads (AMI data is public)
CREATE POLICY "AMI data is publicly readable"
  ON ami_limits FOR SELECT
  USING (true);
```

### Option B: JSON File (Simpler for MVP)

Create `public/data/ami-limits.json` with structure:
```json
{
  "90210": {
    "1": { "30": 25000, "50": 42000, "80": 67000, "100": 84000, "120": 101000 },
    "2": { "30": 28600, "50": 47700, "80": 76300, "100": 95400, "120": 114500 },
    ...
  },
  ...
}
```

## Phase 3: Service Layer Implementation

### Create `services/amiService.ts`

```typescript
import { supabase } from './supabaseClient';

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

  try {
    // Try Supabase first
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('ami_limits')
        .select('*')
        .eq('zip_code', zipCode)
        .eq('family_size', familySize)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching AMI limits:', error);
        return null;
      }

      if (data) {
        return {
          zipCode: data.zip_code,
          county: data.county_name || '',
          msa: data.msa_name || '',
          state: data.state_name || '',
          familySize: data.family_size,
          limits: {
            extremelyLow: data.ami_30_percent,
            veryLow: data.ami_50_percent,
            low: data.ami_80_percent,
            median: data.ami_100_percent,
            moderate: data.ami_120_percent,
          },
          effectiveDate: data.effective_date,
          dataSource: data.data_source || 'HUD',
        };
      }
    }

    // Fallback to JSON file
    return await getAMILimitsFromJSON(zipCode, familySize);
  } catch (error) {
    console.error('Error in getAMILimits:', error);
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
    const response = await fetch('/data/ami-limits.json');
    const data = await response.json();
    
    const zipData = data[zipCode];
    if (!zipData || !zipData[familySize]) {
      return null;
    }

    const limits = zipData[familySize];
    return {
      zipCode,
      county: '',
      msa: '',
      state: '',
      familySize,
      limits: {
        extremelyLow: limits['30'],
        veryLow: limits['50'],
        low: limits['80'],
        median: limits['100'],
        moderate: limits['120'],
      },
      effectiveDate: new Date().toISOString().split('T')[0],
      dataSource: 'HUD (JSON)',
    };
  } catch (error) {
    console.error('Error loading AMI data from JSON:', error);
    return null;
  }
}

/**
 * Determine qualification status based on income
 */
export async function getQualificationStatus(
  zipCode: string,
  familySize: number,
  annualIncome: number
): Promise<QualificationStatus | null> {
  const amiLimits = await getAMILimits(zipCode, familySize);
  if (!amiLimits) {
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
  if (annualIncome <= limits.moderate * 1.15) {
    qualifiesFor.push('USDA Loans');
  }
  if (annualIncome <= limits.moderate) {
    qualifiesFor.push('Many Down Payment Assistance Programs');
  }

  return {
    qualifiesFor,
    incomeCategory,
    percentageOfAMI: Math.round(percentageOfAMI * 10) / 10,
  };
}

/**
 * Extract zip code from address string
 */
export function extractZipCode(address: string): string | null {
  const zipMatch = address.match(/\b\d{5}(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[0].substring(0, 5) : null;
}

function isSupabaseConfigured(): boolean {
  // Import from supabaseClient
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && key);
}
```

## Phase 4: UI Component Implementation

### Create `components/AMILookup.tsx`

See the implementation file for full component code. Key features:
- Zip code input with validation
- Family size selector (1-8+)
- Display of all AMI limits
- Qualification status based on income
- Integration with scenario data

## Phase 5: Integration Points

### Integration with ScenarioBuilder

1. **Auto-populate from address:**
   - When user enters property address, extract zip code
   - Show AMI lookup button/modal

2. **Income qualification display:**
   - Show if borrower income qualifies for AMI-based programs
   - Display percentage of AMI

3. **New tab or section:**
   - Add "AMI & Qualifications" tab
   - Or integrate into existing "Income & Debts" tab

## Phase 6: Testing Checklist

- [ ] Test with various zip codes (urban, suburban, rural)
- [ ] Test with all family sizes (1-8)
- [ ] Test with invalid zip codes
- [ ] Test with missing data scenarios
- [ ] Test income qualification calculations
- [ ] Test UI responsiveness
- [ ] Test error handling
- [ ] Validate data accuracy against HUD website

## Phase 7: Data Update Process

### Annual Update Steps:

1. **Download new HUD data** (typically April)
2. **Run processing script:**
   ```bash
   npm run process-ami-data
   ```
3. **Update Supabase:**
   - Option A: Clear old data and insert new
   - Option B: Insert with new effective_date (keep history)
4. **Update JSON file** (if using fallback)
5. **Test with sample zip codes**
6. **Update effective date in UI**

## Quick Start: Minimal Viable Product

For a quick MVP, you can:

1. **Use a small sample dataset** (top 100 zip codes by population)
2. **Store as JSON** in `public/data/ami-sample.json`
3. **Create simple lookup component** without Supabase
4. **Add to ScenarioBuilder** as a new section

This gets you 80% of the value with 20% of the effort, then you can expand later.

## Next Steps

1. Review this guide
2. Choose data storage approach (Supabase vs JSON)
3. Download sample HUD data
4. Create basic service function
5. Build UI component
6. Integrate with ScenarioBuilder
7. Test and iterate

## Support & Resources

- HUD Income Limits: https://www.huduser.gov/portal/datasets/il.html
- HUD Methodology: https://www.huduser.gov/portal/datasets/il/il2024/2024ILCalcMethodology.pdf
- Census Data: https://data.census.gov/

