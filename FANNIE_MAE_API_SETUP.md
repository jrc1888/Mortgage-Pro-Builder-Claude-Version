# Fannie Mae API Setup Instructions

## Overview
This application now uses Fannie Mae's AMI Lookup API instead of HUD API for Area Median Income (AMI) data.

## Step 1: Get Your Fannie Mae API Credentials

1. Go to [Fannie Mae Developer Portal](https://singlefamily.fanniemae.com/applications-technology/developer-portal)
2. Log in or create an account
3. Create a new application (if you haven't already)
4. You will receive:
   - **Client ID** (e.g., `2d44e75b-355d-4d60-81e0-4c81e971b9`)
   - **Client Secret** (e.g., `TO0wwhchc-BAocVLb~i0xXstbTCS.HGxyBcxrZdrShs.XAy56cw0.dvn3Hh`)
   - ⚠️ **Important**: The Client Secret is only shown once. Save it securely!

## Step 2: Add Environment Variables to Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following two environment variables:

### Variable 1: `VITE_FANNIE_MAE_CLIENT_ID`
- **Value**: Your Client ID from Step 1
- **Environment**: Production, Preview, Development (select all)

### Variable 2: `VITE_FANNIE_MAE_CLIENT_SECRET`
- **Value**: Your Client Secret from Step 1
- **Environment**: Production, Preview, Development (select all)

## Step 3: Find the Exact API Endpoint

The code currently uses a placeholder endpoint. You need to find the exact endpoint from Fannie Mae's API documentation:

1. Log into the [Fannie Mae Developer Portal](https://singlefamily.fanniemae.com/applications-technology/developer-portal)
2. Look for the **AMI Lookup and HomeReady Evaluation API** documentation
3. Find the Swagger/API documentation
4. Locate the endpoint for getting income limits by ZIP code
5. Update the endpoint in `services/fannieMaeApiService.ts`:
   - Find the line: `const url = \`${FANNIE_MAE_API_BASE_URL}/ami-lookup?zipCode=${zipCode}\`;`
   - Replace `/ami-lookup?zipCode=` with the actual endpoint from the documentation

## Step 4: Update Response Parsing (If Needed)

After testing, you may need to adjust how the API response is parsed:

1. Test the API with a known ZIP code
2. Check the browser console for the full response structure
3. Update the parsing logic in `services/amiService.ts` in the `getAMILimitsFromFannieMaeApi` function
4. Adjust the field names to match Fannie Mae's actual response structure

## Step 5: Deploy and Test

1. After adding the environment variables, Vercel will automatically redeploy
2. Test with a ZIP code (e.g., `84121`)
3. Check the browser console for any errors
4. Verify that AMI data appears correctly in the Income tab

## Troubleshooting

### "Fannie Mae API: Credentials not found"
- Make sure you added both `VITE_FANNIE_MAE_CLIENT_ID` and `VITE_FANNIE_MAE_CLIENT_SECRET` to Vercel
- Make sure the variable names match exactly (case-sensitive)
- Redeploy after adding variables

### "Fannie Mae API: Failed to get access token"
- Verify your Client ID and Client Secret are correct
- Check that the token endpoint is correct (currently `/oauth2/token`)
- The token endpoint might be different - check Fannie Mae's documentation

### "Fannie Mae API: 404 Not Found"
- The endpoint URL might be incorrect
- Check the Fannie Mae Developer Portal for the correct endpoint
- Update the endpoint in `services/fannieMaeApiService.ts`

### "Fannie Mae API: Could not extract income limits"
- The response structure might be different than expected
- Check the browser console for the full response
- Update the parsing logic in `services/amiService.ts`

## Notes

- Access tokens expire after 1 hour and are automatically refreshed
- The code caches tokens to avoid unnecessary API calls
- If you need to remove HUD API code completely, you can delete `services/hudApiService.ts` after confirming Fannie Mae works

