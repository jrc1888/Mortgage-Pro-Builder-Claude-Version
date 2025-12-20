# Area Median Income (AMI) Module Research & Implementation Plan

## Executive Summary

This document outlines the research findings and implementation plan for integrating zip code-specific Area Median Income (AMI) limits and qualification information into the Mortgage Pro Builder application.

## 1. Understanding AMI Data Sources

### Primary Data Sources

#### A. HUD Income Limits (Primary Source)
- **What it provides:** Official AMI limits by geographic area and family size
- **Geographic Level:** County and Metropolitan Statistical Area (MSA) level
- **Update Frequency:** Annually (typically released in April)
- **Family Sizes:** 1-8 persons, plus additional for larger families
- **URL:** https://www.huduser.gov/portal/datasets/il.html
- **Data Format:** CSV files, Excel files, and web tables
- **Key Limitation:** Not directly available by zip code - requires mapping

#### B. U.S. Census Bureau
- **What it provides:** Median household income by zip code (ZCTA - Zip Code Tabulation Area)
- **Geographic Level:** Zip code level
- **Update Frequency:** Annually (from American Community Survey)
- **URL:** https://data.census.gov/
- **Use Case:** Can serve as proxy for AMI, but not official HUD limits

#### C. Zip Code to County/MSA Mapping
- **Need:** Crosswalk files to map zip codes to counties/MSAs
- **Sources:**
  - U.S. Census Bureau ZCTA to County Relationship Files
  - HUD's own mapping resources
  - Commercial APIs (e.g., SmartyStreets, Google Geocoding API)

## 2. Data Structure Requirements

### AMI Limits by Family Size
AMI limits are typically provided as:
- **30% of AMI** - Extremely Low Income
- **50% of AMI** - Very Low Income  
- **80% of AMI** - Low Income
- **100% of AMI** - Area Median Income (base)
- **120% of AMI** - Moderate Income (for some programs)

### Family Size Categories
- 1 person
- 2 persons
- 3 persons
- 4 persons
- 5 persons
- 6 persons
- 7 persons
- 8+ persons

### Geographic Hierarchy
```
Zip Code → County/MSA → AMI Limits
```

## 3. Implementation Approaches

### Approach 1: Static Database (Recommended for MVP)
**Pros:**
- Fast lookups
- No external API dependencies
- Predictable costs
- Works offline

**Cons:**
- Requires manual/annual data updates
- Storage requirements (~50-100MB for full dataset)
- Initial data processing effort

**Implementation:**
1. Download HUD income limits CSV annually
2. Download zip code to county/MSA crosswalk
3. Process and merge data into SQLite or JSON database
4. Store in Supabase or include in app bundle
5. Create lookup service

### Approach 2: API Integration
**Pros:**
- Always up-to-date data
- No storage requirements
- Automatic updates

**Cons:**
- API costs (if using commercial service)
- External dependency
- Rate limiting concerns
- Potential downtime

**Potential APIs:**
- **HUD API:** No official public API exists
- **Census Bureau API:** Available but requires processing
- **Commercial APIs:** SmartyStreets, Google Geocoding (for zip→county mapping)

### Approach 3: Hybrid Approach (Recommended for Production)
**Pros:**
- Fast lookups from cached data
- Ability to refresh data periodically
- Fallback to API if needed

**Cons:**
- More complex implementation
- Requires both storage and API integration

## 4. Data Processing Pipeline

### Step 1: Data Acquisition
1. Download HUD Income Limits CSV (annual)
   - File: `FY2024_IL_50_Rev.csv` or similar
   - Contains: State, County/MSA, Family Size, Income Limits

2. Download Zip Code Crosswalk
   - Source: Census Bureau or commercial provider
   - Maps: Zip Code → County FIPS → MSA Code

### Step 2: Data Processing
1. **Merge Datasets:**
   ```
   Zip Code → County FIPS → MSA Code → AMI Limits
   ```

2. **Handle Edge Cases:**
   - Zip codes spanning multiple counties (use primary county)
   - Zip codes in multiple MSAs (use primary MSA)
   - Missing data (fallback to state median)

3. **Normalize Data:**
   - Standardize zip code format (5 digits)
   - Convert income limits to consistent format
   - Calculate percentage thresholds (30%, 50%, 80%, 120%)

### Step 3: Data Storage
**Option A: Supabase Table**
```sql
CREATE TABLE ami_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zip_code VARCHAR(5) NOT NULL,
  county_fips VARCHAR(5),
  msa_code VARCHAR(5),
  state VARCHAR(2),
  family_size INTEGER NOT NULL,
  ami_30_percent DECIMAL(10,2),
  ami_50_percent DECIMAL(10,2),
  ami_80_percent DECIMAL(10,2),
  ami_100_percent DECIMAL(10,2),
  ami_120_percent DECIMAL(10,2),
  effective_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(zip_code, family_size, effective_date)
);

CREATE INDEX idx_ami_zip_family ON ami_limits(zip_code, family_size);
```

**Option B: JSON File (for smaller datasets)**
- Store as `ami-data.json` in public folder
- Structure: `{ "zip_code": { "family_size": { "limits": {...} } } }`

## 5. Module Design

### User Interface Components

#### Component 1: AMI Lookup Tool
**Location:** New tab in ScenarioBuilder or standalone modal

**Inputs:**
- Zip Code (5 digits, validated)
- Family Size (1-8+, dropdown or number input)

**Outputs:**
- Area Median Income (100% AMI)
- Income Limits by Category:
  - Extremely Low (30% AMI)
  - Very Low (50% AMI)
  - Low (80% AMI)
  - Moderate (120% AMI)
- Geographic Context (County, MSA, State)
- Effective Date of Data
- Qualification Programs Available (if applicable)

#### Component 2: Integration with Scenario
- Auto-populate AMI data when zip code is entered
- Display AMI qualification status based on borrower income
- Show eligibility for various loan programs

### API/Service Layer

```typescript
// services/amiService.ts

interface AMILimits {
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
}

interface AMIService {
  getAMILimits(zipCode: string, familySize: number): Promise<AMILimits | null>;
  getQualificationStatus(zipCode: string, familySize: number, income: number): Promise<QualificationStatus>;
}
```

## 6. Qualification Programs Using AMI

### Common Programs:
1. **FHA Loans:** No AMI requirement, but AMI can inform affordability
2. **VA Loans:** No AMI requirement
3. **Conventional Loans:** No AMI requirement
4. **USDA Loans:** Income limits based on AMI (115% of AMI for most areas)
5. **HUD 221(d)(4):** Multifamily loans with AMI requirements
6. **LIHTC (Low-Income Housing Tax Credit):** Various AMI thresholds
7. **Down Payment Assistance Programs:** Often AMI-based (80-120% AMI)
8. **First-Time Homebuyer Programs:** Many are AMI-based

## 7. Implementation Steps

### Phase 1: Research & Data Acquisition (Week 1)
- [ ] Download latest HUD income limits CSV
- [ ] Obtain zip code to county/MSA crosswalk
- [ ] Analyze data structure and completeness
- [ ] Identify data gaps and edge cases

### Phase 2: Data Processing (Week 1-2)
- [ ] Create data processing script
- [ ] Merge datasets
- [ ] Validate data quality
- [ ] Generate normalized dataset

### Phase 3: Backend/Storage (Week 2)
- [ ] Create Supabase table or JSON structure
- [ ] Load processed data
- [ ] Create lookup service/API
- [ ] Add error handling

### Phase 4: Frontend Components (Week 2-3)
- [ ] Create AMI lookup component
- [ ] Design UI for displaying limits
- [ ] Integrate with ScenarioBuilder
- [ ] Add validation and error states

### Phase 5: Testing & Refinement (Week 3)
- [ ] Test with various zip codes
- [ ] Validate calculations
- [ ] Test edge cases
- [ ] User acceptance testing

## 8. Data Update Strategy

### Annual Update Process:
1. **Monitor HUD Releases:** Typically April each year
2. **Download New Data:** Automated script or manual download
3. **Process & Validate:** Run data processing pipeline
4. **Update Database:** Replace or version old data
5. **Notify Users:** Display data effective date in UI

### Versioning Approach:
- Store multiple years of data
- Allow users to select effective date
- Default to most recent data

## 9. Resources & Links

### Official Data Sources:
- **HUD Income Limits:** https://www.huduser.gov/portal/datasets/il.html
- **Census Bureau Data:** https://data.census.gov/
- **HUD User Datasets:** https://www.huduser.gov/portal/datasets/pdrdatas.html

### Zip Code Mapping:
- **Census ZCTA to County:** https://www.census.gov/geographies/reference-files.html
- **HUD Crosswalk Files:** Available in HUD datasets

### Documentation:
- **HUD Income Limits Methodology:** https://www.huduser.gov/portal/datasets/il/il2024/2024ILCalcMethodology.pdf
- **AMI Calculation Guide:** HUD provides detailed methodology documents

## 10. Technical Considerations

### Performance:
- Index zip_code and family_size for fast lookups
- Cache frequently accessed data
- Consider pagination for large result sets

### Accuracy:
- Handle zip codes spanning multiple counties
- Provide data source attribution
- Display effective dates prominently
- Include disclaimers about data accuracy

### Legal/Compliance:
- Include disclaimer that data is for informational purposes
- Recommend users verify with official sources
- Note that AMI limits may vary by program
- Include data source attribution

## 11. Future Enhancements

1. **Program-Specific Eligibility:** Show which programs borrower qualifies for
2. **Historical Data:** Allow viewing AMI trends over time
3. **Geographic Visualization:** Map showing AMI by region
4. **Comparison Tool:** Compare AMI across multiple zip codes
5. **Auto-Detection:** Extract zip code from property address
6. **Notifications:** Alert when AMI data is updated
7. **Export:** Allow exporting AMI reports

## 12. Cost Estimates

### Development Time:
- Data Processing: 8-16 hours
- Backend Service: 8-12 hours
- Frontend Components: 12-16 hours
- Testing & Refinement: 8-12 hours
- **Total: 36-56 hours**

### Ongoing Costs:
- Data Storage: Minimal (Supabase free tier sufficient)
- Data Updates: 2-4 hours annually
- API Costs: None (if using static data)

## Conclusion

The AMI module is a valuable addition that will enhance the Mortgage Pro Builder's functionality. The recommended approach is to start with a static database (Approach 1) for MVP, then evolve to a hybrid approach (Approach 3) for production. This balances development speed, cost, and maintainability.

The module will provide users with critical qualification information that directly impacts loan eligibility for various programs, making it an essential tool for mortgage professionals.

