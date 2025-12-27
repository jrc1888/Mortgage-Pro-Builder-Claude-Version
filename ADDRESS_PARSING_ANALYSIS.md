# Address Parsing Analysis - Working Backwards

## Step 1: How Fannie Mae API Wants to Receive Information

**Endpoint:** `GET /v1/income-limits/addresscheck`

**Required Parameters (all strings, all required):**
- `number` - Building Number (e.g., "123")
- `street` - The street name (e.g., "Main Street")
- `city` - The name of the city (e.g., "Salt Lake City")
- `state` - Two-letter state abbreviation (e.g., "UT")
- `zip` - 5-digit ZIP code (e.g., "84121")

**Key Constraint:** The API validates addresses against their internal geocoding database. If the address format doesn't match what their geocoding service recognizes, it returns 400 Bad Request.

**Example Valid Request:**
```
GET /v1/income-limits/addresscheck?number=123&street=Main+Street&city=Salt+Lake+City&state=UT&zip=84101
```

## Step 2: How We Are Inputting Information

**User Input Location:** `scenario.propertyAddress` field in ScenarioBuilder

**Input Format:** Freeform text string - users can enter:
- Just ZIP code: `"84121"`
- Full address: `"6230 S 2275 E, Holladay, UT 84121"`
- Various formats: `"123 Main St, Salt Lake City, UT 84101"`

**Current Flow:**
1. User types into input field
2. Value stored as-is in `scenario.propertyAddress`
3. Passed to `getAMILimits()` function
4. Sent to `/api/fannie-mae-ami` proxy
5. Currently uses OpenAI to parse into components

## Step 3: The Gap

**Problem:** OpenAI parsing creates structured address components, but:
1. The format may not match what Fannie Mae's geocoding service recognizes
2. The API validates addresses - invalid/non-existent addresses return 400
3. For ZIP-only input, we're generating representative addresses that may not exist in Fannie Mae's database

**Example Issue:**
- User input: `"6230 S 2275 E, Holladay, UT 84121"`
- OpenAI parses to: `{number: "6230", street: "S 2275 E", city: "Holladay", state: "UT", zip: "84121"}`
- Fannie Mae geocoding service: Doesn't recognize "S 2275 E" format → 400 error

## Step 4: Solution Strategy

**Best Approach:** Use a geocoding/address validation service FIRST to normalize the address, THEN send normalized address to Fannie Mae.

**Options:**
1. **Google Maps Geocoding API** - Can normalize addresses and return standardized format
2. **SmartyStreets API** - Address validation and standardization service
3. **USPS Address Validation API** - Official USPS address validation
4. **OpenAI with better context** - Use OpenAI with knowledge of valid address formats

**Recommended Flow:**
1. User input (ZIP or address) → 
2. Geocoding service to normalize/validate → 
3. Extract standardized components (number, street, city, state, zip) → 
4. Send to Fannie Mae API

