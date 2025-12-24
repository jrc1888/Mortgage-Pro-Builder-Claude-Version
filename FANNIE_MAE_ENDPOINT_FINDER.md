# Finding the Correct Fannie Mae Income Limits API Endpoint

## Current Issue
The code is getting a 403 Forbidden error, which suggests the endpoint URL is incorrect.

## What You Need to Do

1. **Go to the Fannie Mae Developer Portal:**
   - URL: https://developer.fanniemae.com/#/products/api/documentation-public/Income%20Limits%20API

2. **Look for the API Endpoint Documentation:**
   - Find the section that shows how to get income limits by ZIP code
   - Look for examples like:
     - `GET /v1/income-limits?zipCode=12345`
     - `GET /v1/income-limits/12345`
     - Or similar patterns

3. **Check for:**
   - The exact path (e.g., `/income-limits`, `/ami-lookup`, etc.)
   - The query parameter name (e.g., `zipCode`, `zip`, `zipcode`, etc.)
   - Whether it uses path parameters (e.g., `/income-limits/{zipCode}`)
   - The base URL (currently using `https://api.fanniemae.com/v1`)

4. **Share the Information:**
   - Copy the exact endpoint URL from the documentation
   - Or take a screenshot of the endpoint documentation
   - Share it with me so I can update the code

## What to Look For in the Documentation

The documentation should show something like:

```
GET /v1/income-limits?zipCode={zipCode}
```

Or:

```
GET /v1/income-limits/{zipCode}
```

Or it might use a different base path entirely.

## Current Code Status

The code is currently trying 12 different endpoint patterns automatically. If none of them work, we need the exact endpoint from the documentation.

## Alternative: Check API Tester/Swagger

If the Developer Portal has an API tester or Swagger UI:
1. Look for the "Try it out" or "Test" button
2. Enter a ZIP code (e.g., 84121)
3. See what endpoint URL it uses
4. Copy that exact URL structure

