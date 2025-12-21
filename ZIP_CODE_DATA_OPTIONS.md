# Getting All Zip Codes - Your Options

## Summary

I've created a solution that can process HUD data files to get AMI limits for ALL zip codes. Here are your options:

## Option 1: You Download Files, I Process Them (Recommended)

**What you do:**
1. Download 2 CSV files from HUD website (takes 5 minutes)
2. Put them in the `data/` folder
3. Run the script I created
4. Done! You get all zip codes

**Pros:**
- ✅ Fastest approach
- ✅ Gets ALL zip codes at once
- ✅ One-time setup
- ✅ You control the data source

**Steps:**
1. Download HUD Income Limits CSV from: https://www.huduser.gov/portal/datasets/il.html
2. Download ZIP Code Crosswalk CSV from: https://www.huduser.gov/portal/datasets/usps_crosswalk.html
3. Save both to the `data/` folder in your project
4. Run: `node scripts/process-ami-data.js`
5. Done! Check `public/data/ami-limits.json`

**See:** `GET_ALL_ZIP_CODES_GUIDE.md` for detailed instructions

## Option 2: You Provide Me the Files

**What you do:**
1. Download the 2 CSV files from HUD
2. Share them with me (you can describe the format if files are too large)
3. I'll adjust the script and process them for you

**Pros:**
- ✅ I handle the processing
- ✅ I can adjust the script if needed
- ✅ You just provide the files

**Cons:**
- ⚠️ Files might be too large to share directly
- ⚠️ May need to share sample rows instead

## Option 3: Manual Addition (For Specific Zip Codes)

**What you do:**
1. Find AMI data for specific zip codes you need
2. Add them manually to `public/data/ami-limits.json`
3. Use the format guide: `HOW_TO_ADD_ZIP_CODES.md`

**Pros:**
- ✅ Quick for a few zip codes
- ✅ No downloading large files

**Cons:**
- ❌ Time-consuming for many zip codes
- ❌ Not practical for all zip codes

## Option 4: Use HUD API (Future Enhancement)

**What it involves:**
- Register for HUD API access
- Create a script that fetches data via API
- More complex, but always up-to-date

**Pros:**
- ✅ Always current data
- ✅ No file management

**Cons:**
- ❌ More complex setup
- ❌ Rate limits
- ❌ Requires API key management

## My Recommendation: Option 1

I recommend **Option 1** because:
1. It's the fastest way to get ALL zip codes
2. The script is already created
3. You just need to download 2 files
4. One command and you're done

The script I created (`scripts/process-ami-data.js`) will:
- Read both CSV files
- Map zip codes to counties/MSAs
- Extract AMI limits for each zip code
- Generate the JSON file your app uses

## What I've Created For You

1. **`scripts/process-ami-data.js`** - Processing script
2. **`GET_ALL_ZIP_CODES_GUIDE.md`** - Step-by-step guide
3. **`data/.gitkeep`** - Folder for your CSV files
4. **Updated `.gitignore`** - So CSV files aren't committed to git

## Next Steps

**If you want to do it yourself (Option 1):**
1. Read `GET_ALL_ZIP_CODES_GUIDE.md`
2. Download the 2 CSV files
3. Run the script
4. Done!

**If you want me to help (Option 2):**
1. Download the CSV files
2. Tell me when you have them (or share sample rows if files are large)
3. I'll help process them

**Which option do you prefer?** 

I can also:
- Adjust the script if your CSV files have different column names
- Help troubleshoot if you run into issues
- Create a simpler version if you just need specific zip codes

