# AMI Module Setup Instructions

## What You Need to Do

I've implemented the AMI (Area Median Income) lookup feature in your Mortgage Pro Builder! Here's what's been done and what you need to do to complete the setup.

## ✅ What's Already Done

1. ✅ **Address Input Updated**: Removed the "TBD" checkbox - now requires at least a zip code
2. ✅ **AMI Component Created**: Added to the Income tab (right side, below monthly debts)
3. ✅ **Auto Zip Extraction**: Automatically extracts zip code from address or uses zip-only input
4. ✅ **Family Size Calculation**: Automatically calculates from borrower count
5. ✅ **Income Qualification**: Shows AMI limits and qualification status based on entered income

## 📋 What You Need to Do

### Step 1: Add Sample AMI Data (To Test Now)

The AMI feature needs data to work. For now, you can use the sample data file I created:

**File Location**: `public/data/ami-limits-sample.json`

This file contains sample data for 3 zip codes (90210, 10001, 60601). The component will automatically use this data if it can't find data in Supabase.

**To test right now:**
1. Open your app
2. Go to a scenario
3. In the property address field, enter a zip code like `90210`, `10001`, or `60601`
4. Go to the Income tab
5. You should see AMI limits displayed on the right side

### Step 2: Get Real HUD Data (For Production)

To get actual AMI data for all zip codes, you'll need to:

#### Option A: Use the Sample Data (Quick Start)
- The sample file I created has 3 zip codes for testing
- You can manually add more zip codes to the JSON file following the same format

#### Option B: Download Full HUD Data (Recommended)
1. **Visit HUD Website**: https://www.huduser.gov/portal/datasets/il.html
2. **Download Income Limits CSV**: 
   - Look for "FY2024 Income Limits" or the most recent year
   - Download the CSV file (something like `FY2024_IL_50_Rev.csv`)
3. **Get Zip Code Crosswalk**:
   - You'll need a file that maps zip codes to counties/MSAs
   - HUD provides crosswalk files, or you can use Census Bureau data
   - Alternative: Use a commercial API like SmartyStreets for real-time lookup

#### Option C: Use Supabase Database (Best for Production)
1. **Create the Database Table**:
   - Open your Supabase dashboard
   - Go to SQL Editor
   - Copy and paste this SQL (from `AMI_IMPLEMENTATION_GUIDE.md`):
   
   ```sql
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
   
   CREATE INDEX IF NOT EXISTS idx_ami_zip_family ON ami_limits(zip_code, family_size);
   CREATE INDEX IF NOT EXISTS idx_ami_zip ON ami_limits(zip_code);
   
   ALTER TABLE ami_limits ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY "AMI data is publicly readable"
     ON ami_limits FOR SELECT
     USING (true);
   ```

2. **Process and Load Data**:
   - You'll need to process the HUD CSV file and zip code crosswalk
   - Merge them together
   - Insert into the Supabase table
   - This requires data processing (can be done with a script or manually)

### Step 3: Test the Feature

1. **Create a New Scenario**:
   - Enter a client name
   - In "Property Address or Zip Code", enter: `90210` (or another zip from sample data)
   - Click "Manually Create"

2. **Go to Income Tab**:
   - You should see "Area Median Income (AMI)" section on the right
   - It should show AMI limits for the zip code you entered
   - If you enter income amounts, it will show qualification status

3. **Test with Full Address**:
   - Try entering a full address like: `123 Main St, Los Angeles, CA 90210`
   - The zip code should be automatically extracted
   - AMI data should still appear

## 📝 How It Works

### Address Input Changes
- **Before**: Had a "TBD" checkbox that disabled the address field
- **Now**: Always requires input - either:
  - Just a zip code (e.g., `90210`)
  - Full address (e.g., `123 Main St, City, State 90210`)
- The zip code is automatically extracted from either format

### AMI Display
- **Location**: Income tab, right column, below "Monthly Debts"
- **What it shows**:
  - Zip code being used
  - All AMI limits (30%, 50%, 80%, 100%, 120%)
  - Your income as percentage of AMI (if income is entered)
  - Qualification programs you may be eligible for
  - Geographic information (County, State)

### Family Size
- Automatically calculated from number of borrowers
- If Borrower 1 has income = 1 person
- If Borrower 1 + Borrower 2 have income = 2 persons
- Minimum is 1 person

## 🎯 Next Steps (Optional Enhancements)

Once you have real data loaded, you can:
1. Add more zip codes to the JSON file manually
2. Set up automatic annual updates when HUD releases new data
3. Add program-specific eligibility details
4. Add historical AMI trends

## 🐛 Troubleshooting

### AMI Data Not Showing
- **Check**: Did you enter a valid zip code in the property address?
- **Check**: Is the zip code in your data file? (sample file only has 90210, 10001, 60601)
- **Check**: Browser console for any errors

### Zip Code Not Extracted
- Make sure the address includes a 5-digit zip code
- Try entering just the zip code first (e.g., `90210`)
- Check the console for extraction errors

### Component Not Visible
- Make sure you're on the Income tab
- Scroll down on the right side - it's below the Monthly Debts section
- Check that the zip code was extracted correctly

## 📚 Documentation

For more detailed information, see:
- `AMI_MODULE_RESEARCH.md` - Full research and approach
- `AMI_IMPLEMENTATION_GUIDE.md` - Technical implementation details
- `AMI_MODULE_SUMMARY.md` - Overview and features

## ✅ Checklist

- [ ] Test with sample zip codes (90210, 10001, 60601)
- [ ] Verify AMI limits display correctly
- [ ] Test with full address (should extract zip)
- [ ] Enter income amounts and verify qualification status
- [ ] (Optional) Download real HUD data
- [ ] (Optional) Set up Supabase table for production use

## Questions?

The feature is ready to use with the sample data! Just enter one of the sample zip codes and go to the Income tab to see it in action.

