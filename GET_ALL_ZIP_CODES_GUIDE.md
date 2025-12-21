# How to Get All Zip Codes with AMI Data

## Overview

To get AMI data for ALL zip codes in the US, you need to:
1. Download HUD Income Limits CSV file
2. Download ZIP Code Crosswalk file
3. Run the processing script
4. The script will generate `ami-limits.json` with all zip codes

## Step-by-Step Instructions

### Step 1: Download HUD Income Limits Data

1. **Visit HUD's Income Limits Page:**
   - Go to: https://www.huduser.gov/portal/datasets/il.html
   - Look for the most recent fiscal year (usually FY2024 or FY2025)

2. **Download the CSV File:**
   - Find the link for "Income Limits CSV" or "IL CSV"
   - File name will be something like: `FY2024_IL_50_Rev.csv`
   - Save it to: `data/hud-income-limits.csv` (create the `data` folder if needed)

3. **File Structure:**
   - The CSV should have columns for: State, County/MSA, and income limits for different family sizes
   - It may have columns like: `1-Person`, `2-Person`, `3-Person`, etc.
   - Or columns like: `Extremely Low`, `Very Low`, `Low`, `AMI`, `Moderate`

### Step 2: Download ZIP Code Crosswalk File

1. **Visit HUD's Crosswalk Page:**
   - Go to: https://www.huduser.gov/portal/datasets/usps_crosswalk.html
   - This maps ZIP codes to counties and MSAs

2. **Download the CSV File:**
   - Download the most recent ZIP Code Crosswalk file
   - File name will be something like: `ZIP_COUNTY_032024.xlsx` or similar
   - If it's Excel, convert it to CSV, or use the CSV version if available
   - Save it to: `data/zip-code-crosswalk.csv`

3. **File Structure:**
   - Should have columns for: ZIP, STATE, COUNTY, COUNTYNAME, MSA, etc.

### Step 3: Create Data Directory

Create a `data` folder in your project root (if it doesn't exist):

```bash
mkdir data
```

### Step 4: Adjust the Script (If Needed)

The processing script (`scripts/process-ami-data.js`) may need adjustment based on the exact column names in your CSV files.

1. **Open the script:** `scripts/process-ami-data.js`
2. **Check the column names** in your downloaded CSV files
3. **Update the script** if column names don't match

Common column name variations:
- `State` vs `STATE` vs `stname`
- `County` vs `COUNTY` vs `countyname`
- `ZIP` vs `ZIPCODE` vs `zip_code`

### Step 5: Run the Processing Script

```bash
node scripts/process-ami-data.js
```

The script will:
- Read both CSV files
- Process and merge the data
- Generate `public/data/ami-limits.json` with all zip codes

### Step 6: Test the Output

1. Check that `public/data/ami-limits.json` was created
2. Open it and verify it has zip code data
3. Test in your app with a zip code

## Alternative: Use HUD API (More Complex)

If you prefer to use the API instead of CSV files:

1. **Register for HUD API:**
   - Go to: https://www.huduser.gov/hudapi/public/login
   - Create an account and get an API key

2. **Create a Script to Fetch Data:**
   - Would need to loop through all counties/MSAs
   - Map zip codes to areas
   - Fetch AMI limits for each area
   - This is more complex and rate-limited

**Recommendation:** Use the CSV approach - it's simpler and faster for bulk data.

## Troubleshooting

### Script Fails to Parse CSV

**Problem:** Column names don't match

**Solution:**
1. Open the CSV file in Excel or a text editor
2. Check the actual column names in the header row
3. Update the script to match your column names
4. Look for the `processIncomeLimits` and `processZipCodeCrosswalk` functions

### Missing Zip Codes

**Problem:** Some zip codes don't have data

**Reasons:**
- ZIP code doesn't exist
- ZIP code is PO Box only
- Crosswalk file doesn't include it
- No income limits data for that area

**Solution:** The script will skip zip codes without matching data. This is normal.

### File Too Large

**Problem:** The output JSON file is very large (could be 10+ MB)

**Solution:** This is expected! With ~33,000 US zip codes, the file will be large. It should still work fine in the browser.

## File Size Expectations

- **ZIP Code Crosswalk:** ~2-5 MB
- **Income Limits CSV:** ~500 KB - 2 MB
- **Output JSON:** ~5-15 MB (depends on number of zip codes)

## Quick Start (If You Have the Files)

1. Create `data` folder: `mkdir data`
2. Put CSV files in `data` folder:
   - `data/hud-income-limits.csv`
   - `data/zip-code-crosswalk.csv`
3. Run: `node scripts/process-ami-data.js`
4. Check output: `public/data/ami-limits.json`

## Need Help?

If you download the files and the script doesn't work:
1. Check the column names in your CSV files
2. Share the first few rows (header + 2-3 data rows) and I can help adjust the script
3. Check console output for specific errors

## Next Steps After Processing

Once you have the complete `ami-limits.json` file:
1. Test it in your app
2. Commit it to git (or add to .gitignore if it's too large)
3. Set up annual updates when HUD releases new data

