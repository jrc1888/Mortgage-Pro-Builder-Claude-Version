# AMI Data Not Loading - Fix Plan

## Problem Identified

The AMI service is looking for `/data/ami-limits.json` but the file is named `ami-limits-sample.json`.

## Root Cause

In `services/amiService.ts` line 109, the code tries to fetch:
```typescript
const response = await fetch('/data/ami-limits.json');
```

But the actual file is:
```
public/data/ami-limits-sample.json
```

## Fix Options

### Option 1: Rename the File (Recommended)
**Pros:** Simple, matches what the service expects
**Steps:**
1. Rename `public/data/ami-limits-sample.json` to `public/data/ami-limits.json`
2. Test that data loads

### Option 2: Update the Service
**Pros:** Keeps sample name for clarity
**Steps:**
1. Update `services/amiService.ts` line 109 to fetch `ami-limits-sample.json`
2. Test that data loads

### Option 3: Create Both Files
**Pros:** Sample file stays as reference
**Steps:**
1. Copy `ami-limits-sample.json` to `ami-limits.json`
2. Use `ami-limits.json` for production
3. Keep `ami-limits-sample.json` as template

## Recommended Solution: Option 1

Rename the file because:
- The service already expects `ami-limits.json`
- It's the production-ready name
- Users will add real data to this file anyway
- Simpler and cleaner

## Additional Checks Needed

1. **Verify file is in public folder** - ✅ Already confirmed
2. **Check browser console for fetch errors** - Need to verify
3. **Test with actual zip codes** - 90210, 10001, 60601 should work
4. **Verify JSON structure matches** - Need to check

## Testing Steps After Fix

1. Rename file to `ami-limits.json`
2. Restart dev server (if running)
3. Enter zip code `90210` in property address
4. Go to Income tab
5. Check if AMI data appears
6. Check browser console for any errors

## If Still Not Working

Check these:
- Browser console for fetch errors (404, CORS, etc.)
- Network tab to see if file is being requested
- Verify file is actually in `public/data/` folder
- Check if dev server needs restart
- Verify JSON is valid (no syntax errors)

