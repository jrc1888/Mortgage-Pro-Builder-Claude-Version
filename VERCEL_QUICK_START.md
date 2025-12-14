# ⚡ VERCEL DEPLOYMENT - QUICK REFERENCE

## 🎯 Critical Steps for Vercel Deployment

### 1️⃣ Get Supabase Credentials
Go to your Supabase project → Settings → API

Copy these two values:
```
Project URL:     https://xxxxx.supabase.co
anon public key: eyJhbGciOiJI... (very long string)
```

---

### 2️⃣ Add to Vercel Environment Variables

When deploying to Vercel, add these **EXACT** variable names:

| Variable Name | Variable Value |
|--------------|----------------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJI...` |

**Make sure to:**
- ✅ Check all three boxes: Production, Preview, Development
- ✅ No spaces before/after the values
- ✅ Use EXACT variable names (case-sensitive!)

---

### 3️⃣ Vercel Deployment Settings

**Framework Preset:** Vite
**Build Command:** `npm run build`
**Output Directory:** `dist`
**Install Command:** `npm install`

These should be auto-detected, but verify them!

---

## 🔄 Re-deploying After Changes

If you already deployed but need to add/change environment variables:

1. Go to Vercel Dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add or edit the variables
5. Go to **Deployments** tab
6. Click the **"..."** menu on the latest deployment
7. Click **"Redeploy"**

---

## ✅ Testing Checklist

After deployment:

- [ ] Visit your Vercel URL
- [ ] See the login screen (not "Supabase Not Configured")
- [ ] Create a test account
- [ ] Receive confirmation email
- [ ] Sign in successfully
- [ ] Create a test scenario
- [ ] Scenario saves and appears in dashboard
- [ ] Sign out and sign back in - data still there!

---

## 🐛 Common Issues

### Issue: "Supabase Not Configured" message appears

**Fix:** 
- Environment variables not set correctly
- Variable names must be EXACTLY: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Redeploy after adding variables

### Issue: Build fails on Vercel

**Fix:**
- Check build logs in Vercel
- Make sure all dependencies are in package.json
- Try building locally first: `npm run build`

### Issue: White screen after deployment

**Fix:**
- Check browser console (F12) for errors
- Verify environment variables are set
- Check Vercel deployment logs

---

## 📱 Your Deployment URLs

After deployment, Vercel gives you:

**Production URL:** `https://your-project.vercel.app`
**Preview URLs:** Created for each PR/branch
**Custom Domain:** Can add your own domain in Vercel settings

---

## 🔐 Security Notes

✅ **Safe to expose:**
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

❌ **NEVER expose:**
- Database password
- Service role key
- API secret keys

Your data is protected by Row Level Security (RLS) in Supabase!

---

## 📞 Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Your Setup Guide:** See SETUP_GUIDE.md for full instructions

---

**Ready to deploy? Let's go! 🚀**
