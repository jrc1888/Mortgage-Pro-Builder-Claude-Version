-- Mortgage Pro Builder - Supabase Database Schema
-- This file contains the complete database setup for multi-user mortgage scenario management

-- ============================================================================
-- 1. CREATE SCENARIOS TABLE
-- ============================================================================
-- This table stores all mortgage scenarios with user isolation
CREATE TABLE IF NOT EXISTS public.scenarios (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    name TEXT NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
-- Index on user_id for fast filtering by user
CREATE INDEX IF NOT EXISTS idx_scenarios_user_id ON public.scenarios(user_id);

-- Index on client_name for fast client-based queries
CREATE INDEX IF NOT EXISTS idx_scenarios_client_name ON public.scenarios(client_name);

-- Index on last_updated for sorting
CREATE INDEX IF NOT EXISTS idx_scenarios_last_updated ON public.scenarios(last_updated DESC);

-- Composite index for common query pattern (user + last_updated)
CREATE INDEX IF NOT EXISTS idx_scenarios_user_updated ON public.scenarios(user_id, last_updated DESC);

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CREATE RLS POLICIES
-- ============================================================================
-- These policies ensure users can only access their own data

-- Policy: Users can view only their own scenarios
DROP POLICY IF EXISTS "Users can view own scenarios" ON public.scenarios;
CREATE POLICY "Users can view own scenarios" 
ON public.scenarios
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own scenarios
DROP POLICY IF EXISTS "Users can insert own scenarios" ON public.scenarios;
CREATE POLICY "Users can insert own scenarios" 
ON public.scenarios
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own scenarios
DROP POLICY IF EXISTS "Users can update own scenarios" ON public.scenarios;
CREATE POLICY "Users can update own scenarios" 
ON public.scenarios
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own scenarios
DROP POLICY IF EXISTS "Users can delete own scenarios" ON public.scenarios;
CREATE POLICY "Users can delete own scenarios" 
ON public.scenarios
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- 5. CREATE FUNCTION TO UPDATE last_updated AUTOMATICALLY
-- ============================================================================
-- This function automatically updates the last_updated timestamp on updates
CREATE OR REPLACE FUNCTION public.update_last_updated_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. CREATE TRIGGER FOR AUTO-UPDATE
-- ============================================================================
DROP TRIGGER IF EXISTS update_scenarios_last_updated ON public.scenarios;
CREATE TRIGGER update_scenarios_last_updated
    BEFORE UPDATE ON public.scenarios
    FOR EACH ROW
    EXECUTE FUNCTION public.update_last_updated_column();

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================
-- Grant authenticated users access to the scenarios table
GRANT ALL ON public.scenarios TO authenticated;
GRANT ALL ON public.scenarios TO service_role;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Add environment variables to your project:
--    VITE_SUPABASE_URL=your_project_url
--    VITE_SUPABASE_ANON_KEY=your_anon_key
-- 3. Deploy to Vercel with these environment variables set
