# Property Search System Fix Request

## Problem Statement

I have a property search system that accepts three types of input:
1. **Property listing URLs** (from sites like Zillow, Redfin, Homes.com, UtahRealEstate.com)
2. **Manual property addresses** (e.g., "581 w summerhill lane centerville")
3. **MLS numbers** (e.g., "mls 2107231")

The system should extract property data (price, beds, baths, sqft, HOA, year built) and compare it against borrower qualifications. However, the search functionality is currently failing for most input types.

## What's Working ✅

From the logs, I can see that:
- **Redfin URLs** work perfectly: Direct fetch succeeds, extracts all data correctly (price, beds, baths, sqft, HOA $20/mo, year built 2025)
- **Utah Real Estate URLs** work perfectly: Direct fetch succeeds, extracts all data correctly
- **Direct fetch mechanism** works well for Redfin and UtahRealEstate.com sites
- **OpenAI extraction** works excellently when it receives proper page content (extracts price, beds, baths, sqft, HOA, year built with high confidence)

## What's NOT Working ❌

From the error logs:

1. **Homes.com URLs**: 
   - Direct fetch is blocked (403/401/429)
   - Falls back to Google Search
   - Google Search returns ZERO results for ALL queries tried
   - Result: Complete failure, no property data extracted

2. **Zillow URLs**:
   - Shows "Page content fetched successfully" but then still goes to Google Search fallback
   - Google Search returns ZERO results
   - Result: Complete failure, no property data extracted

3. **Manual Address Inputs**:
   - Address normalization works (converts "581 w summerhill centerville" to "581 W Summerhill Lane, Centerville, UT 84014")
   - User confirms address correctly
   - System tries to search but Google Search returns ZERO results
   - `tryDirectUrlConstruction()` function exists but doesn't seem to be working or is returning null
   - Result: Complete failure, no property data extracted

4. **MLS Number Inputs**:
   - MLS to address conversion fails
   - Google Search returns ZERO results for MLS queries
   - Result: Complete failure, can't even find the address from MLS

## Critical Issue: Google Search Returning Zero Results

**The most critical problem**: Google Custom Search API is returning ZERO results for ALL queries. This suggests:
- Google Search API credentials might be wrong/expired
- Search queries might be malformed
- Rate limiting might be occurring
- The search engine ID might be incorrect

However, this might also be because the queries are too specific or restrictive.

## Current Code Structure

The system is built with:
- **Backend**: Vercel serverless functions (TypeScript)
- **Main API endpoint**: `/api/sms-process.ts` (handles URL and address inputs)
- **MLS endpoint**: `/api/find-address-from-mls.ts` (converts MLS to address)
- **Address normalization**: `/api/normalize-address.ts` (normalizes free-form addresses)

### Key Functions in `/api/sms-process.ts`:

1. **`ingestListingText(url)`**: Attempts direct fetch of URL content
   - Works for Redfin and UtahRealEstate.com
   - Fails (403/blocked) for Homes.com and Zillow
   - Converts HTML to plain text using `htmlToPlainText()`

2. **`getListingDataFromUrl(url)`**: Main handler for URL inputs
   - Tries direct fetch first via `ingestListingText(url)`
   - If direct fetch succeeds but critical fields are missing, falls back to Google Search (line 1552)
   - **PROBLEM 1**: In catch block (line 1564), if direct fetch fails, it goes straight to Google Search with the URL: `getListingDataFromGoogleSearch(url, undefined, undefined)`
   - **PROBLEM 2**: In main handler (`handler` function, line 1627), when `getListingDataFromUrl` fails, it extracts address but then goes straight to Google Search: `getListingDataFromGoogleSearch(undefined, undefined, addressFromUrl)`
   - **SHOULD DO**: When direct fetch fails, extract address from URL, then call `tryDirectUrlConstruction(addressFromUrl)` BEFORE falling back to Google Search
   - The `tryDirectUrlConstruction()` function exists but is never called for URL fallbacks - only for address inputs (and even then, it's not working)

3. **`getListingDataFromGoogleSearch(url?, mlsNumber?, address?)`**: Google Search aggregation
   - Constructs Google Search queries targeting specific sites (zillow.com, redfin.com, utahrealestate.com, homes.com, realtor.com)
   - Should fetch pages from multiple sites and aggregate data
   - Currently: Returns ZERO results for ALL queries

4. **`tryDirectUrlConstruction(address)`**: Attempts to construct direct URLs
   - Tries to build URLs like:
     - `https://www.utahrealestate.com/{streetNum}-{streetName}-{city}-{state}-{zip}/`
     - `https://www.redfin.com/{state}/{city}/{streetName}-{zip}/home/`
     - `https://www.homes.com/property/{streetName}-{city}-{state}/`
   - Uses regex to parse address: `/(\d+)\s+(.+?)(?:,\s*)?(.+?)?,\s*([A-Z]{2})\s+(\d{5})/i`
   - **POTENTIAL ISSUE**: This regex might not match the normalized address format from `normalize-address.ts`
   - Should fetch and extract from these constructed URLs
   - Currently: Doesn't seem to be working (function returns null immediately, suggesting regex doesn't match or validation too strict)
   - **When called**: Should be called for address searches before Google Search fallback

5. **`extractListingWithOpenAISinglePage(url, rawText, source, targetAddress?)`**: OpenAI extraction
   - Uses GPT-4o to extract structured property data from plain text
   - Works excellently when given good content
   - Validates extracted address against `targetAddress`

6. **`extractAddressFromUrl(url)`**: Extracts address from URL patterns
   - Handles Zillow, Redfin, Homes.com, UtahRealEstate URL formats
   - Works correctly for Redfin and UtahRealEstate

### Key Functions in `/api/find-address-from-mls.ts`:

1. **`googleSearch(query)`**: Google Custom Search API helper
   - Returns top 5 results with title, snippet, link
   - Uses `VITE_GOOGLE_SEARCH_API_KEY` and `VITE_GOOGLE_SEARCH_ENGINE_ID`
   - Currently returning ZERO results

2. **MLS address extraction**: Uses Google Search + OpenAI to find address from MLS number
   - Currently failing because Google Search returns no results

## Google Search Query Patterns (Current - Problematic)

The current Google Search queries being used include:
- `"{address}" (site:zillow.com OR site:redfin.com OR site:utahrealestate.com OR site:realtor.com OR site:homes.com) "for sale"`
- `"{address}" site:zillow.com "for sale"`
- `"{address}" site:redfin.com "for sale"`
- etc.

**Problem**: These queries include `"for sale"` which might be too restrictive. However, the code was recently updated to remove `"for sale"` but the logs still show queries with `"for sale"`, suggesting either:
- The deployment hasn't updated yet (Vercel might be running cached/old code)
- There's still old code paths that weren't updated
- The queries are being constructed in a different way than expected

**Critical**: The Google Custom Search API is returning ZERO results for ALL queries, regardless of format. This suggests either:
1. Google Search API credentials are wrong/expired/missing
2. The search engine ID (`VITE_GOOGLE_SEARCH_ENGINE_ID`) is incorrect
3. Rate limiting or quota exceeded
4. The search engine configuration in Google Custom Search Console doesn't allow searching those sites

**Recommended Fix**: Since Google Search is completely failing, the solution should prioritize **direct URL construction** and only use Google Search as an absolute last resort with very simple queries.

## Goal

I want a **simple, reliable system** that:

1. **For URLs**:
   - Try direct fetch first (works for Redfin, UtahRealEstate)
   - **If direct fetch fails/blocked**:
     - Extract address from URL using `extractAddressFromUrl()` (this works)
     - **Use the extracted address to construct direct URLs** to known working sites (redfin.com, utahrealestate.com, homes.com) using `tryDirectUrlConstruction()`
     - Fetch from these constructed URLs directly
     - **DO NOT** immediately fall back to Google Search - try direct URL construction first
   - Only use Google Search as absolute last resort if direct URL construction also fails

2. **For Addresses**:
   - Normalize address first (already works)
   - User confirms address (already works)
   - **Priority 1**: Try constructing direct URLs to known working sites (homes.com, redfin.com, utahrealestate.com) and fetch directly
   - **Priority 2**: If direct URL construction fails, try Google Search with simplified queries (no "for sale", no complex OR operators)
   - **Priority 3**: If Google Search still fails, try even simpler queries or just search the address without site restrictions

3. **For MLS**:
   - Convert MLS to address first (currently failing)
   - Once address is found, follow the address search flow above

## Specific Technical Requirements

1. **Fix Google Search issues**: Either fix the Google Search API calls (check credentials, simplify queries) OR bypass Google Search entirely and rely on direct URL construction

2. **Improve direct URL construction**: 
   - **CRITICAL**: Fix the address parsing regex - the current regex `/(\d+)\s+(.+?)(?:,\s*)?(.+?)?,\s*([A-Z]{2})\s+(\d{5})/i` might not correctly parse normalized addresses like "581 W Summerhill Lane, Centerville, UT 84014"
   - The regex needs to properly extract: street number, street name (including direction like "W"), city, state, zip
   - Make the `tryDirectUrlConstruction()` function more robust
   - Try multiple URL format variations for each site (e.g., Redfin might use different formats)
   - Be more lenient with address matching validation
   - Don't require exact address match if we get good data (price, beds, baths)
   - Add better error logging to see why URL construction is failing

3. **Simplified fallback strategy**:
   - Direct fetch → Direct URL construction → Simple Google Search (if absolutely necessary)
   - Avoid complex Google Search queries with multiple sites and "for sale" requirements

4. **Error handling**: When Google Search returns zero results, the system should:
   - Log the exact query used
   - Try simpler queries
   - Try queries without site restrictions
   - Provide meaningful error messages

## What I Need

Please analyze the code in `/api/sms-process.ts` and `/api/find-address-from-mls.ts` and:

1. **Identify why Google Search is returning zero results** - Is it the API credentials, query format, rate limiting, or something else?

2. **Fix the `tryDirectUrlConstruction()` function** - Make it actually work for addresses, try more URL variations, be more lenient with validation

3. **Simplify the search strategy** - Prioritize direct URL construction over Google Search, only use Google Search as last resort with simple queries

4. **Ensure the fallback chain works correctly**: Direct fetch → Direct URL construction → Simple Google Search

5. **Fix MLS address lookup** - Either fix Google Search for MLS queries or use an alternative approach

## Code Files to Review

- `/api/sms-process.ts` - Main property search logic
- `/api/find-address-from-mls.ts` - MLS to address conversion
- `/api/normalize-address.ts` - Address normalization (this one works fine, don't change)

## Test Cases That Should Work

1. **Zillow URL**: `https://www.zillow.com/homedetails/581-W-Summerhill-Ln-N-Centerville-UT-84014/450680059_zpid/`
   - Should extract address from URL
   - Should try direct fetch (might fail, that's okay)
   - Should construct direct URLs to redfin.com/utahrealestate.com/homes.com and fetch from those
   - Should extract complete data (price, beds, baths, sqft, HOA, year built)

2. **Homes.com URL**: `https://www.homes.com/property/581-w-summerhill-ln-centerville-ut/v24dex912e1nl/`
   - Should extract address from URL
   - Direct fetch might be blocked (that's okay)
   - Should construct direct URLs to redfin.com/utahrealestate.com and fetch from those
   - Should extract complete data

3. **Manual address**: "581 w summerhill lane centerville"
   - Should normalize to "581 W Summerhill Lane, Centerville, UT 84014"
   - Should construct direct URLs to utahrealestate.com, redfin.com, homes.com
   - Should fetch from at least one of those sites
   - Should extract complete data

4. **MLS number**: "mls 2107231"
   - Should find address from MLS
   - Then follow address search flow above

## Additional Context

- The system uses OpenAI GPT-4o for extraction, which works excellently when given good content
- The `htmlToPlainText()` function converts HTML to readable text successfully
- Redfin and UtahRealEstate.com work perfectly, so the extraction pipeline is solid
- The issue is purely with FINDING the right content when direct fetch fails or when searching by address/MLS
- Google Custom Search API credentials are configured in Vercel environment variables as `VITE_GOOGLE_SEARCH_API_KEY` and `VITE_GOOGLE_SEARCH_ENGINE_ID`

Please provide a solution that prioritizes **reliability over complexity** - direct URL construction should be the primary method, Google Search should only be used when absolutely necessary with simple queries.

