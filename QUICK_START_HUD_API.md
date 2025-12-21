# Quick Start: HUD API Setup

## What You Need to Do

You have your HUD API token ready. Here's what to do:

### Step 1: Get Your Actual Token Value

In your HUD API dashboard, find your token named "HUD AMI" and **copy the actual token string** (it will be a long string like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### Step 2: Add Token to .env File

1. **Create or open `.env` file** in your project root (same folder as `package.json`)

2. **Add this line:**
   ```
   VITE_HUD_API_TOKEN=paste_your_token_here
   ```
   
   Replace `paste_your_token_here` with your actual token (no quotes needed)

3. **Save the file**

### Step 3: Restart Dev Server

1. **Stop your dev server** (Ctrl+C if running)
2. **Start it again:**
   ```bash
   npm run dev
   ```

### Step 4: Test It!

1. Open your app
2. Create/open a scenario
3. Enter any zip code (e.g., `90210`, `10001`, `75201`)
4. Go to Income tab
5. You should see AMI data from HUD API!

## For Vercel Deployment

1. Go to Vercel → Your Project → Settings → Environment Variables
2. Add variable:
   - **Name:** `VITE_HUD_API_TOKEN`
   - **Value:** Your token
3. Redeploy

## Troubleshooting

**Not working?** Check browser console (F12) for error messages. Common issues:
- Token not found → Check `.env` file exists and variable name is correct
- Unauthorized (401) → Token is wrong or expired
- Check console for "HUD API" error messages

## What Changed

The app now uses HUD API first (if configured), then falls back to:
1. HUD API (real-time) ← **NEW!**
2. Supabase database (if configured)
3. JSON file (sample data)

See `HUD_API_SETUP.md` for full documentation.

