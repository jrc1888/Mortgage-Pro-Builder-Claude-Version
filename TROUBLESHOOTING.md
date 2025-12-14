# 🔧 Troubleshooting Guide - Complete Checklist

## 🚨 Quick Diagnosis

**What's wrong? Use this quick checklist:**

- [ ] "Supabase Not Configured" message → Go to Section 1
- [ ] Can't sign up/login → Go to Section 2
- [ ] Data not saving → Go to Section 3
- [ ] Can see other users' data → Go to Section 4
- [ ] Build/deployment fails → Go to Section 5
- [ ] White screen / blank page → Go to Section 6

---

## Section 1: "Supabase Not Configured" Message

### Problem
You see a yellow warning screen saying "Supabase Not Configured"

### Diagnosis Steps

#### ✅ Step 1.1: Check Environment Variables in Vercel
1. Go to Vercel Dashboard → Your Project
2. Click **Settings** → **Environment Variables**
3. You should see TWO variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

**Missing variables?**
- Add them using values from Supabase (Settings → API)
- Make sure to check Production, Preview, AND Development
- Click "Save"
- Go to Deployments → Redeploy

#### ✅ Step 1.2: Check Variable Names
**EXACT names required:**
```
VITE_SUPABASE_URL          ✅ Correct
vite_supabase_url          ❌ Wrong (lowercase)
SUPABASE_URL               ❌ Wrong (missing VITE_)
REACT_APP_SUPABASE_URL     ❌ Wrong (this is for Create React App)
```

#### ✅ Step 1.3: Check Variable Values
**URL Format:**
```
https://abcdefg.supabase.co    ✅ Correct
abcdefg.supabase.co            ❌ Wrong (missing https://)
https://abcdefg.supabase.co/   ❌ Wrong (extra slash)
```

**Key Format:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...    ✅ Correct (very long)
eyJ...                                     ❌ Wrong (truncated)
"eyJ..."                                   ❌ Wrong (don't include quotes)
```

#### ✅ Step 1.4: Force Redeploy
1. Vercel Dashboard → Your Project
2. Deployments tab
3. Latest deployment → "..." menu
4. Click "Redeploy"
5. Wait for deployment to complete
6. Try again

---

## Section 2: Can't Sign Up / Login

### Problem 2A: Sign Up Not Working

#### ✅ Check Email Provider
1. Supabase Dashboard → Authentication → Providers
2. Make sure "Email" is enabled (toggle ON)
3. Save if you made changes

#### ✅ Check Email Confirmation
1. Check your email inbox (including spam!)
2. Look for email from Supabase
3. Click confirmation link
4. Return to app and try signing in

#### ✅ Password Requirements
- Minimum 6 characters
- No maximum (but keep it reasonable)

#### ✅ Check Logs
1. Supabase Dashboard → Logs → Auth
2. Look for errors around the time you tried to sign up
3. Common errors:
   - "Email already registered" → Try signing in instead
   - "Invalid email format" → Check email address

### Problem 2B: Sign In Not Working

#### ✅ Verify Account Exists
1. Supabase Dashboard → Authentication → Users
2. Search for your email
3. Not there? Create new account
4. There but "Email Confirmed" = No? Check your email for confirmation link

#### ✅ Check Password
- Did you confirm your account?
- Try password reset if needed
- Make sure caps lock is off

#### ✅ Browser Console
1. Open browser (F12)
2. Go to Console tab
3. Try signing in
4. Look for errors in red
5. Common errors:
   - "Invalid login credentials" → Wrong email/password
   - "Network error" → Check internet connection

---

## Section 3: Data Not Saving

### Problem
You create/edit scenarios but they don't save or disappear

#### ✅ Step 3.1: Check You're Signed In
1. Look for logout button in top-right
2. If not there, you're not signed in
3. Sign in and try again

#### ✅ Step 3.2: Check Database Table Exists
1. Supabase Dashboard → Database → Table Editor
2. Look for table named "scenarios"
3. Not there? Run the `supabase_schema.sql` script

#### ✅ Step 3.3: Check RLS Policies
1. Supabase Dashboard → Database → Table Editor
2. Click on "scenarios" table
3. Top-right should show "RLS enabled" with green checkmark
4. Click the shield icon to view policies
5. Should see 4 policies (SELECT, INSERT, UPDATE, DELETE)
6. Missing? Run the `supabase_schema.sql` script again

#### ✅ Step 3.4: Check Browser Console
1. Open DevTools (F12)
2. Console tab
3. Try saving a scenario
4. Look for errors
5. Common errors:
   - "Permission denied" → RLS policy issue
   - "User not found" → Not properly signed in
   - "Network error" → Check Supabase is online

#### ✅ Step 3.5: Test Directly in Supabase
1. Create a scenario in your app
2. Immediately go to Supabase → Database → Table Editor
3. Click "scenarios" table
4. Do you see a new row?
   - **Yes** → Data is saving! Issue is loading it back
   - **No** → Data not reaching database

---

## Section 4: Can See Other Users' Data

### Problem
You can see scenarios from other users (SECURITY ISSUE!)

#### ✅ URGENT: Check RLS is Enabled
1. Supabase Dashboard → Database → Table Editor
2. Click "scenarios" table
3. Top banner should say "RLS enabled" ✅
4. If it says "RLS disabled" ❌:
   ```sql
   ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
   ```
   Run this in SQL Editor immediately!

#### ✅ Verify Policies Exist
Run this in SQL Editor:
```sql
SELECT * FROM pg_policies WHERE tablename = 'scenarios';
```

Should return 4 rows (SELECT, INSERT, UPDATE, DELETE)

If not, run the complete `supabase_schema.sql` script again

#### ✅ Test Isolation
1. Create test account A
2. Create a scenario as user A
3. Sign out
4. Create test account B
5. Should see EMPTY dashboard
6. If you see user A's data → RLS not working properly

---

## Section 5: Build/Deployment Fails

### Problem
Vercel deployment fails or shows errors

#### ✅ Check Build Logs
1. Vercel → Deployments
2. Click failed deployment
3. Read the logs (scroll to find red errors)

#### ✅ Common Build Errors

**Error: "Module not found"**
```
Fix: Missing dependency in package.json
Solution: Check if all imports have corresponding dependencies
```

**Error: "Environment variable not found"**
```
Fix: Environment variables not set
Solution: Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel
```

**Error: "TypeScript error"**
```
Fix: Type checking failed
Solution: Check the specific file/line mentioned in error
```

#### ✅ Test Build Locally
```bash
npm install
npm run build
```

If it fails locally:
- Read the error message
- Fix the issue
- Push to GitHub
- Vercel will auto-redeploy

---

## Section 6: White Screen / Blank Page

### Problem
App loads but shows blank white page

#### ✅ Check Browser Console
1. Press F12
2. Console tab
3. Look for errors in red
4. Common errors:
   - "Failed to fetch" → Supabase connection issue
   - "Uncaught TypeError" → JavaScript error
   - "404 Not Found" → Asset loading issue

#### ✅ Check Network Tab
1. Press F12
2. Network tab
3. Reload page
4. Look for failed requests (red)
5. Click on failed request to see details

#### ✅ Check Deployment
1. Vercel → Deployments
2. Make sure latest deployment succeeded
3. Green checkmark = good
4. Red X = failed (check logs)

#### ✅ Try Different Browser
- Test in Chrome/Firefox/Safari
- Test in incognito/private mode
- Disable browser extensions

---

## 🔍 Advanced Debugging

### Enable Verbose Logging

Add this to your code temporarily to debug:

```javascript
// In services/supabase.ts
console.log('Loading scenarios...');
const { data, error } = await supabase.from('scenarios').select();
console.log('Data:', data);
console.log('Error:', error);
```

### Check Supabase Status
- Visit https://status.supabase.com
- Make sure all systems operational

### Check Vercel Status
- Visit https://vercel.com/status
- Make sure all systems operational

---

## 📋 Pre-Deployment Checklist

Before deploying, verify:

- [ ] Supabase project created
- [ ] Database schema run successfully
- [ ] Can see "scenarios" table in Supabase
- [ ] RLS is enabled on scenarios table
- [ ] 4 policies exist on scenarios table
- [ ] Got Project URL from Supabase
- [ ] Got anon key from Supabase
- [ ] Added both env vars to Vercel
- [ ] Variable names are EXACT (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] Checked all 3 environment boxes (Production, Preview, Development)
- [ ] No extra spaces in variable values
- [ ] URL starts with https://
- [ ] Code pushed to GitHub

---

## 🧪 Testing Checklist

After deployment, verify:

- [ ] Can access the Vercel URL
- [ ] See login screen (not "Supabase Not Configured")
- [ ] Can create new account
- [ ] Receive confirmation email
- [ ] Can sign in after confirming email
- [ ] Can create new scenario
- [ ] Scenario appears in dashboard
- [ ] Can edit scenario
- [ ] Changes persist after reload
- [ ] Can sign out
- [ ] Can sign back in
- [ ] Data still there after sign in
- [ ] Create second test account
- [ ] Second account sees empty dashboard
- [ ] Cannot see first account's data

---

## 🆘 Still Stuck?

### Information to Gather

If you need to ask for help, include:

1. **Exact error message** (screenshot or copy/paste)
2. **Browser console errors** (F12 → Console tab)
3. **What you were trying to do** (step-by-step)
4. **What happened instead**
5. **Supabase logs** (if relevant)
6. **Vercel build logs** (if deployment failed)

### Resources

- **Supabase Docs:** https://supabase.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **Supabase Discord:** https://discord.supabase.com
- **Stack Overflow:** Tag questions with `supabase` and `vercel`

---

## ✅ Success Indicators

You know it's working when:

✅ Login screen loads (not config warning)
✅ Can create and confirm account
✅ Dashboard loads after login
✅ Can create scenarios
✅ Scenarios persist after logout/login
✅ Different users see different data
✅ No console errors (F12)
✅ Works on mobile browsers
✅ Works on different devices

---

**Remember:** Most issues are simple configuration problems. Work through this checklist systematically and you'll find the solution! 💪
