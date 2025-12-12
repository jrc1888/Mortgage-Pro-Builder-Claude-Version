
import { createClient } from '@supabase/supabase-js';

// These should be set in your .env file or hosting provider environment variables
// VITE_SUPABASE_URL
// VITE_SUPABASE_ANON_KEY

// Helper to safely get env vars without crashing during build or runtime if missing
const getEnv = (key: string) => {
    try {
        // @ts-ignore
        const val = import.meta.env?.[key];
        return val ? val.trim() : '';
    } catch {
        return '';
    }
};

const rawUrl = getEnv('VITE_SUPABASE_URL');
const rawKey = getEnv('VITE_SUPABASE_ANON_KEY');

// Validate URL format to prevent crashes (Supabase throws if not http/https)
const isValidUrl = (url: string) => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
};

// Use fallback if URL is missing OR invalid (e.g. user entered "mysupabaseproject" without https://)
// This prevents the "Uncaught Error: Invalid supabaseUrl" crash.
const effectiveUrl = (rawUrl && isValidUrl(rawUrl)) 
    ? rawUrl 
    : 'https://placeholder.supabase.co';

const effectiveKey = rawKey || 'placeholder';

// Helper to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
    return isValidUrl(rawUrl) && 
           rawKey.length > 0 && 
           // Ensure we aren't using the fallback as a valid configuration
           rawUrl !== 'https://placeholder.supabase.co';
};

// Initialize the Supabase client
export const supabase = createClient(effectiveUrl, effectiveKey);
