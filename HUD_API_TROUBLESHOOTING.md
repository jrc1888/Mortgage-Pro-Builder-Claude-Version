# HUD API Troubleshooting Guide

## Current Issue: 400 Bad Request Error

The income limits API is returning a 400 error: "Missing or invalid value in the query parameter(s)".

### What's Working
✅ Token is detected and working  
✅ Crosswalk API is working (returns census tracts)  
✅ County FIPS is being extracted correctly (49035 from geoid 49035111002)  

### What's Not Working
❌ Income limits API returns 400 error when using county FIPS `49035`

## Possible Solutions

### Option 1: Check HUD API Documentation for Entity ID Format

The entity ID format might be different than expected. Check:
- https://www.huduser.gov/portal/dataset/fmr-api.html
- Look for examples of entity IDs for counties
- The format might be:
  - Just the county code (035)
  - State abbreviation + county (UT-035)
  - A different numeric format
  - Requires a lookup endpoint first

### Option 2: Use MSA Instead of County

Some areas might need to use MSA (Metropolitan Statistical Area) instead of county:
1. Check if the area has an MSA
2. Use MSA code instead of county FIPS
3. Try `type=msa` instead of `type=county`

### Option 3: Look Up Entity ID First

HUD API might require looking up the entity ID first:
1. Use a lookup endpoint to get the correct entity ID
2. Then use that ID to get income limits

### Option 4: Use Different Endpoint

There might be a direct ZIP code endpoint:
- `/il/data?zipcode={zipcode}`
- Or another format that doesn't require entity ID

## Next Steps

1. **Check HUD API Dashboard:**
   - Log into your HUD API account
   - Look for API documentation or examples
   - Check if there's a test/example endpoint

2. **Test Directly:**
   - Try making a direct API call using Postman or curl
   - Test with a known working county
   - See what format works

3. **Contact HUD Support:**
   - If you have access to HUD support
   - Ask about the correct entity ID format for income limits API
   - Request example requests/responses

4. **Alternative Approach:**
   - Use the CSV download method instead of API
   - Process the data and store in Supabase
   - This is more reliable but requires manual updates

## Current Code Status

The code is trying multiple formats:
- `49035` (full FIPS)
- `49-035` (state-county)
- `035` (county only)
- `49.035` (state.county)

All are returning 400 errors, suggesting the format or endpoint might be fundamentally different.

## Recommendation

Since the API format is unclear, I recommend:
1. **Short term:** Use the JSON file method with manually added zip codes
2. **Long term:** Once we figure out the correct API format, switch to API

Would you like me to:
- Help you test the API directly to find the correct format?
- Set up the CSV processing method as an alternative?
- Create a hybrid approach that uses API when it works, falls back to JSON?

