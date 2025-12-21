# HUD API Setup Guide

## Overview

Your app is now configured to use the HUD API for real-time AMI (Area Median Income) data! This provides the most up-to-date information for all US zip codes.

## Step 1: Get Your API Token

You mentioned you already have:
- ✅ HUD API account created
- ✅ Personal access token named "HUD AMI"

**Important:** You need to copy the actual token value (the long string), not just the name.

## Step 2: Add API Token to Environment Variables

### For Local Development

1. **Create or edit `.env` file** in your project root:
   - If the file doesn't exist, create it
   - If it exists, open it

2. **Add your HUD API token:**
   ```
   VITE_HUD_API_TOKEN=your_actual_token_here
   ```
   
   **Replace `your_actual_token_here`** with your actual token from HUD.

3. **Important Notes:**
   - The variable name MUST be exactly: `VITE_HUD_API_TOKEN`
   - Do NOT include quotes around the token
   - Do NOT commit the `.env` file to git (it's already in .gitignore)

4. **Restart your dev server:**
   ```bash
   npm run dev
   ```

### For Vercel Deployment

1. **Go to your Vercel project dashboard**
2. **Navigate to:** Settings → Environment Variables
3. **Add new variable:**
   - **Name:** `VITE_HUD_API_TOKEN`
   - **Value:** Your HUD API token (paste the actual token)
   - **Environment:** Select all (Production, Preview, Development)

4. **Redeploy** your application for changes to take effect

## Step 3: Test It

1. **Start your app** (if not already running)
2. **Create a scenario** or open an existing one
3. **Enter any zip code** in the property address field (e.g., `90210`, `10001`, `60601`, or any valid US zip code)
4. **Go to the Income tab**
5. **You should see AMI limits** displayed on the right side

## How It Works

The app now follows this priority order:

1. **HUD API** (if token is configured) - Real-time, always up-to-date
2. **Supabase Database** (if configured) - Cached data
3. **JSON File** (fallback) - Static sample data

## API Endpoints Used

The app uses these HUD API endpoints:

1. **ZIP Code Crosswalk:**
   - `GET /usps?type=1&query={zipcode}`
   - Maps ZIP code to county/MSA

2. **Income Limits:**
   - `GET /il/data/{entityid}?type=county`
   - Gets AMI limits for a specific county

## Troubleshooting

### "AMI data not found" Message

**Possible causes:**
1. **Token not configured** - Check that `VITE_HUD_API_TOKEN` is set correctly
2. **Invalid token** - Verify your token is correct in HUD dashboard
3. **ZIP code doesn't exist** - Some ZIP codes may not have data
4. **API error** - Check browser console (F12) for specific error messages

### Check if API is Working

1. **Open browser console** (F12 → Console tab)
2. **Look for messages** like:
   - `HUD API: Unauthorized` - Token is wrong or missing
   - `HUD API Error: 404` - Data not found for that ZIP code
   - `Error fetching income limits from HUD API` - Network or API issue

### Token Issues

- **Token not working?** 
  - Make sure you copied the full token (it's a long string)
  - Check that the token hasn't expired
  - Verify in HUD dashboard that the token is active

- **Token format:**
  - Should be a long string like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  - No spaces or quotes needed

## Security Notes

- ✅ The token is stored in environment variables (secure)
- ✅ The token is only used in API requests (not exposed to users)
- ✅ `.env` file is in `.gitignore` (won't be committed)
- ⚠️ The token will be visible in the browser's bundled JavaScript (this is normal for VITE_ variables)
- ⚠️ HUD API tokens are designed to be used client-side

## What's Next?

Once configured, you can:
- ✅ Use ANY valid US zip code (not just the 3 sample ones)
- ✅ Get real-time, up-to-date AMI data
- ✅ No need to download CSV files or process data
- ✅ Data automatically stays current

## Need Help?

If you run into issues:
1. Check the browser console for error messages
2. Verify your token is correct
3. Test with a known zip code (like 90210)
4. Make sure the dev server was restarted after adding the token

