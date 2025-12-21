# How to Add More Zip Codes to AMI Data

## Quick Guide

The AMI feature uses data from `public/data/ami-limits-sample.json`. Currently it only has 3 zip codes (90210, 10001, 60601) for testing.

## Option 1: Add Zip Codes Manually (Easiest)

1. Open the file: `public/data/ami-limits-sample.json`

2. Find the HUD Income Limits data for your zip code:
   - Visit: https://www.huduser.gov/portal/datasets/il.html
   - Download the Income Limits CSV file
   - Find your zip code's county/MSA
   - Look up the income limits for that area

3. Add a new entry following this format:

```json
"YOUR_ZIP_CODE": {
  "county": "County Name",
  "msa": "Metropolitan Statistical Area Name",
  "state": "State Code (e.g., CA, NY, TX)",
  "effectiveDate": "2024-04-01",
  "1": {
    "30": 25000,    // 30% AMI for 1 person
    "50": 42000,    // 50% AMI for 1 person
    "80": 67000,    // 80% AMI for 1 person
    "100": 84000,   // 100% AMI for 1 person
    "120": 101000   // 120% AMI for 1 person
  },
  "2": {
    "30": 28600,
    "50": 47700,
    "80": 76300,
    "100": 95400,
    "120": 114500
  },
  "3": {
    "30": 32200,
    "50": 53700,
    "80": 85900,
    "100": 107400,
    "120": 128900
  },
  "4": {
    "30": 35800,
    "50": 59600,
    "80": 95400,
    "100": 119300,
    "120": 143200
  },
  "5": {
    "30": 38700,
    "50": 64400,
    "80": 103000,
    "100": 128800,
    "120": 154600
  },
  "6": {
    "30": 41500,
    "50": 69200,
    "80": 110700,
    "100": 138400,
    "120": 166100
  },
  "7": {
    "30": 44400,
    "50": 74000,
    "80": 118400,
    "100": 148000,
    "120": 177600
  },
  "8": {
    "30": 47200,
    "50": 78700,
    "80": 125900,
    "100": 157400,
    "120": 188900
  }
}
```

4. Save the file and refresh your app!

## Option 2: Find Your Zip Code's AMI Data Online

1. Go to HUD's Income Limits page: https://www.huduser.gov/portal/datasets/il.html
2. Click on your state
3. Find your county or MSA
4. Look at the income limits table
5. Use those numbers to fill in the JSON format above

## Option 3: Use a Lookup Tool

Some websites provide AMI lookup tools where you can enter a zip code and get the limits. You can then copy those numbers into the JSON file.

## Example: Adding Zip Code 75201 (Dallas, TX)

Let's say you want to add Dallas zip code 75201. You would:

1. Look up Dallas County AMI limits on HUD's website
2. Find that for 1 person, the 80% AMI limit might be $58,000
3. Add it to the JSON file:

```json
"75201": {
  "county": "Dallas",
  "msa": "Dallas-Fort Worth-Arlington, TX",
  "state": "TX",
  "effectiveDate": "2024-04-01",
  "1": {
    "30": 21800,
    "50": 36300,
    "80": 58000,
    "100": 72500,
    "120": 87000
  },
  // ... continue for family sizes 2-8
}
```

## Important Notes

- Make sure the zip code is in quotes: `"75201"` not `75201`
- Make sure there's a comma after each zip code entry except the last one
- The numbers should match the HUD data for your area
- Family sizes 1-8 are required
- Percentages (30, 50, 80, 100, 120) are required for each family size

## Need Help Finding Data?

If you can't find the data for a specific zip code:
1. Check if the zip code exists (some may be PO boxes only)
2. Try finding the county the zip code belongs to
3. Use the county's AMI limits as an approximation

## Testing

After adding a zip code:
1. Save the JSON file
2. Refresh your browser/app
3. Enter the zip code in the property address field
4. Go to the Income tab
5. You should see the AMI limits!

