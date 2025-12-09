# Mortgage Pro Builder - Cloud Edition

A professional mortgage scenario builder with multi-user authentication and cloud storage.

## 🚀 Quick Start

**See the included documentation files for complete setup:**

- **README_START_HERE.md** - Overview and quick deployment guide
- **SETUP_GUIDE.md** - Detailed step-by-step instructions
- **VERCEL_QUICK_START.md** - Vercel deployment reference
- **TROUBLESHOOTING.md** - Solutions to common issues

## ✨ Features

- 🔐 Secure multi-user authentication
- ☁️ Cloud database storage with Supabase
- 📊 Advanced mortgage calculations
- 💼 Client scenario management
- 📱 Responsive design
- 🚀 Ready for Vercel deployment

## 🛠 Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Vercel (Hosting)

## 📦 Deployment Steps

1. Create Supabase project
2. Run `supabase_schema.sql` in Supabase SQL Editor
3. Get your Supabase credentials (URL + anon key)
4. Deploy to Vercel with environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

That's it! Full instructions in SETUP_GUIDE.md

## 🔒 Security

- Row Level Security (RLS) enabled
- User data completely isolated
- Passwords hashed
- HTTPS encryption

Built with ❤️ for mortgage professionals
