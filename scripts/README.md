# Data Processing Scripts

## AMI Data Processing

The `process-ami-data.js` script processes HUD Income Limits and ZIP Code Crosswalk files to generate a comprehensive JSON file with AMI limits for all US zip codes.

### Prerequisites

1. Node.js installed (comes with npm)
2. Downloaded HUD CSV files (see `GET_ALL_ZIP_CODES_GUIDE.md`)

### Quick Start

1. **Download the required CSV files:**
   - HUD Income Limits: https://www.huduser.gov/portal/datasets/il.html
   - ZIP Code Crosswalk: https://www.huduser.gov/portal/datasets/usps_crosswalk.html
   - Save them to the `data/` folder

2. **Run the script:**
   ```bash
   node scripts/process-ami-data.js
   ```

3. **Output:**
   - Creates `public/data/ami-limits.json` with all zip codes

### Note

The script may need adjustment based on the exact format of your downloaded CSV files. Check `GET_ALL_ZIP_CODES_GUIDE.md` for detailed instructions and troubleshooting.

