# Fannie Mae API 400 Error Debugging Strategy

## Problem Summary
We're consistently getting 400 "Bad Request" errors from Fannie Mae API when trying to fetch income limits, despite:
- Using correct endpoint (`/v1/income-limits/addresscheck`)
- Using correct parameter names (`number`, `street`, `city`, `state`, `zip`)
- All parameters marked as required in documentation
- Authentication header present (`x-public-access-token`)

## Logical Analysis

### What We Know Works:
1. ✅ API endpoint format: `/v1/income-limits/addresscheck`
2. ✅ HTTP Method: GET
3. ✅ Parameter names: `number`, `street`, `city`, `state`, `zip`
4. ✅ Authentication: `x-public-access-token` header
5. ✅ CORS proxy is working (we're getting responses, not CORS errors)

### What We DON'T Know:
1. ❓ **Exact format requirements** - Documentation says "required" but not what format
2. ❓ **Address validation** - Does Fannie Mae validate addresses against their own geocoding service?
3. ❓ **Street name format** - Is "S 2275 E" acceptable, or does it need "2275 E" or "2275 East"?
4. ❓ **URL encoding** - Are special characters being encoded correctly?
5. ❓ **API key permissions** - Does the API key have access to this specific endpoint?

## Diagnostic Steps (In Order of Likelihood)

### Step 1: Check Vercel Function Logs
**Why**: The logs will show the EXACT request being sent and EXACT response received.

**Action**: 
1. Deploy the updated code with comprehensive logging
2. Make a test request
3. Check Vercel dashboard → Functions → `fannie-mae-ami` → Logs
4. Look for:
   - The exact URL being constructed
   - The parsed address components
   - The full error response from Fannie Mae

### Step 2: Verify Address Parsing
**Why**: OpenAI might be parsing the address in a format Fannie Mae doesn't accept.

**Test Case**: "6230 S 2275 E, Holladay, UT 84121"
- What does OpenAI return?
- Is the street name "S 2275 E" or something else?
- Are all components present and valid?

**Action**: Check the logs for `"Fannie Mae API Proxy: Parsed address:"`

### Step 3: Test with Simple, Known-Good Address
**Why**: If a simple address works, the issue is address-specific formatting.

**Test Case**: Try "123 Main St, Salt Lake City, UT 84101"
- This is a very standard address format
- If this works but our test address doesn't, it's a parsing/formatting issue

### Step 4: Check API Key Permissions
**Why**: The API key might not have access to the Income Limits endpoint.

**Action**: 
1. Verify in Fannie Mae Developer Portal that the API key has Income Limits API access
2. Try making a direct API call (outside of our code) to verify the key works

### Step 5: Check URL Encoding
**Why**: Special characters in addresses might not be encoded correctly.

**Current URL**: `number=6230&street=S+2275+E&city=Holladay&state=UT&zip=84121`
- The space in "S 2275 E" becomes `+` which should be correct
- But maybe Fannie Mae expects `%20` or no encoding?

### Step 6: Try Alternative Street Format
**Why**: The street "S 2275 E" might need to be normalized.

**Possibilities**:
- "2275 E" (remove directional prefix)
- "2275 East" (spell out directional)
- "2275 E St" (add street type)

## Most Likely Issues (Ranked)

1. **Address Format Validation** (80% likely)
   - Fannie Mae's geocoding service might not recognize "S 2275 E" as a valid street
   - The API might validate addresses against their internal database before returning income limits
   - **Solution**: Try normalizing street names or using a geocoding service to get a standardized address

2. **Missing or Invalid Parameter Format** (15% likely)
   - One of the parameters might need a specific format we're not providing
   - **Solution**: Check if any parameter can be empty or needs specific format

3. **API Key Permissions** (5% likely)
   - API key might not have access to this endpoint
   - **Solution**: Verify in Fannie Mae Developer Portal

## Next Steps

1. ✅ Add comprehensive logging (DONE)
2. ⏳ Review Vercel function logs after next deployment
3. ⏳ Test with simple address format
4. ⏳ If logs show exact error, address specific validation issue
5. ⏳ Consider using a geocoding service to standardize addresses before calling Fannie Mae

