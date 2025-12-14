# 🚀 Mortgage Pro Builder - Multi-User Setup Guide

This guide will walk you through setting up your Mortgage Pro Builder with Supabase authentication and cloud storage, so each user has their own isolated data.

## 📋 Prerequisites

- GitHub account (✅ you have this)
- Supabase account (free tier is fine)
- Vercel account (free tier is fine)

---

## Step 1: Set Up Supabase Database

### 1.1 Create a Supabase Project

1. Go to https://supabase.com and sign in/sign up
2. Click **"New Project"**
3. Fill in:
   - **Name**: `mortgage-pro-builder` (or any name you like)
   - **Database Password**: Create a strong password (save it somewhere safe!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"**
5. Wait 1-2 minutes for the project to be created

### 1.2 Run the Database Schema

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Copy the ENTIRE contents of `supabase_schema.sql` file
4. Paste it into the SQL editor
5. Click **"Run"** (or press Ctrl/Cmd + Enter)
6. You should see "Success. No rows returned" - this is good!

### 1.3 Get Your Supabase Credentials

1. In your Supabase project, click **"Settings"** (gear icon in sidebar)
2. Click **"API"** in the settings menu
3. You'll see:
   - **Project URL** - copy this (looks like `https://xxxxx.supabase.co`)
   - **anon public** key - copy this (long string starting with `eyJ...`)
4. **SAVE THESE SOMEWHERE SAFE** - you'll need them in the next steps!

### 1.4 Configure Email Authentication (Optional but Recommended)

1. In Supabase, go to **"Authentication"** → **"Providers"**
2. Click on **"Email"**
3. Make sure **"Enable Email provider"** is ON
4. You can customize the email templates if you want
5. For production, set up a custom SMTP provider (optional)

---

## Step 2: Deploy to Vercel

### 2.1 Push Your Code to GitHub

Your code is already on GitHub at:
`https://github.com/jrc1888/Mortgage-Pro-Builder-Claude-Version`

Make sure the latest code is pushed there.

### 2.2 Connect to Vercel

1. Go to https://vercel.com and sign in (use GitHub login for easiest setup)
2. Click **"Add New..."** → **"Project"**
3. Import your repository: `Mortgage-Pro-Builder-Claude-Version`
4. Click **"Import"**

### 2.3 Configure Environment Variables

**CRITICAL STEP** - Before deploying, add your Supabase credentials:

1. In the Vercel project setup, scroll to **"Environment Variables"**
2. Add the following variables:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | Your Supabase Project URL from Step 1.3 |
   | `VITE_SUPABASE_ANON_KEY` | Your anon public key from Step 1.3 |

3. Make sure **"Production"**, **"Preview"**, and **"Development"** are all checked
4. Click **"Deploy"**

### 2.4 Wait for Deployment

- Vercel will build and deploy your app (takes 1-3 minutes)
- Once complete, you'll get a live URL like `https://mortgage-pro-builder-xxxx.vercel.app`

---

## Step 3: Test Your Multi-User System

### 3.1 Create Your First User

1. Go to your deployed Vercel URL
2. You should see a beautiful login screen
3. Click **"Create an account"**
4. Enter your email and password (minimum 6 characters)
5. Click **"Create Account"**
6. Check your email for a confirmation link
7. Click the confirmation link
8. Go back to your app and sign in

### 3.2 Create a Test Scenario

1. Once logged in, you'll see the Dashboard
2. Click **"+ New Scenario"**
3. Enter a client name (e.g., "John Doe")
4. Click **"Create Scenario"**
5. Fill in some mortgage details
6. Click **"Save"**
7. Go back to Dashboard - you should see your scenario!

### 3.3 Test Multi-User Isolation

1. **Open an incognito/private browser window**
2. Go to your Vercel URL again
3. Create a DIFFERENT account (different email)
4. Sign in with the new account
5. You should see an EMPTY dashboard - no scenarios!
6. This proves that users can only see their own data ✅

---

## Step 4: Verify Everything Works

### ✅ Checklist

- [ ] Can create new accounts
- [ ] Can sign in/sign out
- [ ] Can create new scenarios
- [ ] Can edit and save scenarios
- [ ] Can delete scenarios
- [ ] Each user only sees their own data
- [ ] Data persists after logout/login
- [ ] Works on mobile browsers

---

## 🎯 What Changed from Local Storage?

### Before (Local Storage)
- ❌ All data stored in browser
- ❌ Data lost if you clear browser
- ❌ No way to access from another device
- ❌ No user accounts
- ❌ Everyone shares the same data

### After (Supabase)
- ✅ Data stored in cloud database
- ✅ Data persists forever
- ✅ Access from any device
- ✅ Secure user accounts
- ✅ Each user has isolated data
- ✅ Automatic backups

---

## 🔧 Development Setup (Local Testing)

If you want to run the project locally on your computer:

### 1. Clone the Repository
```bash
git clone https://github.com/jrc1888/Mortgage-Pro-Builder-Claude-Version.git
cd Mortgage-Pro-Builder-Claude-Version
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create Environment File
Create a file called `.env` in the root directory:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run Development Server
```bash
npm run dev
```

Open http://localhost:5173 in your browser!

---

## 🐛 Troubleshooting

### Problem: "Supabase Not Configured" message

**Solution**: 
- Make sure you added the environment variables in Vercel
- Variable names must be EXACTLY `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Redeploy after adding variables

### Problem: Can't sign in

**Solution**:
- Check email for confirmation link
- Make sure email provider is enabled in Supabase
- Check Supabase logs: Dashboard → Logs → Auth

### Problem: Data not saving

**Solution**:
- Check Supabase → Database → Tables - is the `scenarios` table there?
- Check RLS policies are enabled
- Check browser console for errors (F12)

### Problem: "User not found" error

**Solution**:
- Make sure you're signed in
- Try signing out and back in
- Check Supabase → Authentication → Users - is your user there?

---

## 📊 Monitoring Your Users & Data

### View Your Users
1. Go to Supabase Dashboard
2. Click **"Authentication"** → **"Users"**
3. You'll see all registered users

### View Your Data
1. Go to Supabase Dashboard
2. Click **"Database"** → **"Table Editor"**
3. Click on **"scenarios"** table
4. You'll see all scenarios (with user_id showing who owns each)

### Check Logs
1. Go to Supabase Dashboard
2. Click **"Logs"**
3. Select different log types (Auth, Database, etc.)

---

## 🎉 Success!

You now have a fully functional, multi-user mortgage calculator with:
- ✅ Secure authentication
- ✅ Cloud database storage
- ✅ User data isolation
- ✅ Real-time sync across devices
- ✅ Professional deployment on Vercel

**Your Google AI Studio version is still safe and untouched!**

---

## 🆘 Need Help?

If you run into issues:
1. Check the Troubleshooting section above
2. Check browser console (F12) for errors
3. Check Supabase logs for database errors
4. Review this guide step-by-step

---

## 🔄 Updating Your App

When you make changes to your code:

1. Push changes to GitHub:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```

2. Vercel automatically redeploys! (takes 1-2 minutes)

---

**You're all set! 🚀**
