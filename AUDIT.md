# Mortgage Calculator Application - Comprehensive Audit

**Date:** 2024  
**Application Type:** React + Vite (NOT Next.js - user mentioned Next.js but codebase uses Vite)  
**Deployment:** Vercel  
**Framework:** React 18.2.0 with Vite 5.1.4

---

## 1. Current Architecture

### 1.1 Framework & Build System
- **Framework:** React 18.2.0 (NOT Next.js)
- **Build Tool:** Vite 5.1.4
- **TypeScript:** 5.2.2
- **Routing:** Client-side routing via state management (`view` state in `App.tsx`)
- **Structure:** Single Page Application (SPA) with component-based architecture

**Files:**
- `vite.config.ts` - Vite configuration
- `tsconfig.json` - TypeScript configuration
- `index.tsx` - Application entry point
- `App.tsx` - Main application component with routing logic

**Issues:**
- ❌ **Line 1 (package.json):** Application is described as "mortgage-pro-scenario-builder" but user mentioned "Next.js app" - this is actually a Vite + React SPA
- ⚠️ **vite.config.ts:14-15:** Environment variables are hardcoded in build config (`GEMINI_API_KEY`) - should use `import.meta.env` pattern

### 1.2 API/Services Integration

**Integrated Services:**
1. **Supabase** (`services/supabase.ts`, `services/supabaseClient.ts`)
   - Database for scenario storage
   - Authentication
   - Fallback to localStorage when not configured

2. **OpenAI API** (`api/ai-parse.ts`, `api/generate-scenario-name.ts`, `api/parse-address.ts`)
   - Natural language scenario parsing
   - Scenario name generation
   - Address parsing

3. **Fannie Mae API** (`api/fannie-mae-ami.ts`, `services/fannieMaeApiService.ts`)
   - AMI (Area Median Income) data lookup
   - Income limits by address/ZIP

4. **HUD API** (`services/hudApiService.ts`)
   - HUD income limits

5. **Gemini API** (`services/geminiService.ts`)
   - Alternative AI service (appears unused in main flow)

**Files:**
- `api/` directory contains Vercel serverless functions
- `services/` directory contains client-side service modules

**Issues:**
- ⚠️ **api/generate-scenario-name.ts:20:** Uses both `VITE_OPENAI_API_KEY` and `OPENAI_API_KEY` - inconsistent env var naming
- ⚠️ **services/fannieMaeApiService.ts:17-18:** Uses `import.meta.env` while API routes use `process.env` - inconsistent patterns
- ❌ **services/geminiService.ts:** Gemini service exists but appears unused - dead code?

### 1.3 Form Handling Approach

**Pattern:** Controlled components with React state
- All inputs use `value` and `onChange` pattern
- State managed in parent components (`App.tsx`, `ScenarioBuilder.tsx`)
- Custom input components in `components/CommonInputs.tsx`

**Files:**
- `components/CommonInputs.tsx` - Reusable input components
- `components/ScenarioBuilder.tsx` - Main form component (2651+ lines - TOO LARGE)

**Issues:**
- ❌ **components/ScenarioBuilder.tsx:** 2651 lines - violates single responsibility principle
- ⚠️ **components/CommonInputs.tsx:12-81:** `FormattedNumberInput` has complex formatting logic that could be extracted
- ⚠️ **components/ScenarioBuilder.tsx:396-459:** `handleInputChange` function handles multiple field types - could be split

### 1.4 State Management Strategy

**Pattern:** React useState + useEffect hooks
- No global state management library (Redux, Zustand, etc.)
- State passed via props
- LocalStorage for user defaults and fallback data storage

**Files:**
- `App.tsx` - Main application state
- `components/Dashboard.tsx` - Dashboard state
- `components/ScenarioBuilder.tsx` - Scenario builder state

**Issues:**
- ⚠️ **App.tsx:30-44:** User defaults stored in localStorage - no sync across devices
- ⚠️ **services/supabase.ts:5-21:** Dual storage pattern (Supabase + localStorage) adds complexity
- ❌ **No centralized state management:** Large prop drilling in `ScenarioBuilder.tsx`

### 1.5 PDF Generation Method

**Library:** jsPDF (`jspdf` package)

**Files:**
- `services/preApprovalPDF.ts` - Pre-approval letter generation
- `services/submissionPDF.ts` - Submission email PDF generation
- `api/generate-submission-pdf.ts` - Serverless function for PDF generation

**Issues:**
- ⚠️ **services/preApprovalPDF.ts:4-8:** Brand colors hardcoded (Guild Mortgage)
- ⚠️ **services/preApprovalPDF.ts:17-24:** Officer information hardcoded - should be configurable
- ⚠️ **services/preApprovalPDF.ts:11-14:** Legal footer text hardcoded - compliance requirement but should be in config

---

## 2. Calculation Logic Issues

### 2.1 Where Calculations Happen

**Location:** Client-side only (`services/loanMath.ts`)

**Main Function:** `calculateScenario()` in `services/loanMath.ts:83`

**Files:**
- `services/loanMath.ts` - All mortgage calculations (519 lines)
- `components/ScenarioBuilder.tsx:88` - Calls `calculateScenario()` on state changes

**Issues:**
- ✅ Calculations are centralized in one file - GOOD
- ⚠️ **services/loanMath.ts:83-519:** Single massive function - should be broken into smaller functions
- ❌ **No server-side validation:** All calculations happen client-side - vulnerable to manipulation

### 2.2 Calculation Consistency

**Issues Found:**
- ⚠️ **services/loanMath.ts:139-148:** FHA MIP calculation uses hardcoded factors (0.0055, 0.0050, 0.0095, etc.) - should be configurable
- ⚠️ **services/loanMath.ts:104-106:** UFMIP rates hardcoded (1.75% for FHA, 2.15% for VA default)
- ⚠️ **services/loanMath.ts:71-80:** Title insurance calculation uses hardcoded tiers ($250k, $550k, $1650 flat)
- ⚠️ **components/ScenarioBuilder.tsx:1214-1262:** Section total calculations duplicate logic from `loanMath.ts` - DRY violation

**Specific Problems:**
- ❌ **components/ScenarioBuilder.tsx:1233-1238 vs services/loanMath.ts:291-293:** Buyer's agent commission calculation duplicated
- ❌ **components/ScenarioBuilder.tsx:1247-1252 vs services/loanMath.ts:291-293:** HOA transfer fee calculation duplicated
- ❌ **components/ScenarioBuilder.tsx:1314-1316 vs services/loanMath.ts:** Realtor admin fee calculation inconsistent (one checks `isFixed`, other doesn't)

### 2.3 Hardcoded Values That Should Be Configurable

**Critical Hardcoded Values:**

1. **DTI Ratios:**
   - `services/loanMath.ts:444` - Conventional: 46.99% front-end, 49.99% back-end
   - `services/loanMath.ts:445` - FHA: 46.99% front-end, 57.00% back-end
   - `services/validation.ts:74-75` - Validation thresholds: 43% warning, 50% max

2. **MIP Rates:**
   - `services/loanMath.ts:139` - FHA MIP factor 0.0055 (LTV > 95%)
   - `services/loanMath.ts:140` - FHA MIP factor 0.0050 (LTV ≤ 95%)
   - `services/loanMath.ts:145-148` - Conventional PMI factors by LTV tier

3. **Loan Limits:**
   - `services/validation.ts:35-36` - Conventional: $766,550 conforming, $1,149,825 high-balance
   - `services/validation.ts:39-40` - FHA: $498,257 floor, $1,149,825 ceiling

4. **Title Insurance:**
   - `services/loanMath.ts:71-80` - Tiered calculation with hardcoded thresholds

5. **Rental Income:**
   - `services/loanMath.ts:375` - 75% of rental income used for DTI (hardcoded)

**Recommendation:** Move all these to `constants.ts` or a configuration file

### 2.4 Redundant Calculation Functions

**Duplicated Logic:**

1. **Closing Cost Calculations:**
   - `services/loanMath.ts:248-299` - Main calculation
   - `components/ScenarioBuilder.tsx:1214-1262` - Section totals (duplicates percentage logic)
   - `components/ScenarioBuilder.tsx:1445-1500` - Summary totals (duplicates again)

2. **Percentage Conversions:**
   - `components/ScenarioBuilder.tsx:524-555` - `toggleCostFixed()` converts $ ↔ %
   - Same logic appears in multiple places for different fee types

3. **Money Formatting:**
   - `services/preApprovalPDF.ts:46-48` - `formatCurrency()` function
   - Multiple inline `toLocaleString()` calls throughout components
   - No centralized formatting utility

---

## 3. Data Flow Problems

### 3.1 Form Data Management

**Pattern:** Controlled components with React state

**Files:**
- `components/ScenarioBuilder.tsx:87` - Main scenario state
- `components/ScenarioBuilder.tsx:396-459` - `handleInputChange()` handles all field updates

**Issues:**
- ⚠️ **components/ScenarioBuilder.tsx:396-459:** Single function handles 10+ different field types - complex conditional logic
- ⚠️ **components/ScenarioBuilder.tsx:79-86:** Undo/redo history system tracks full scenario state - memory intensive
- ❌ **No form validation on input:** Validation only happens on blur/debounce

### 3.2 Validation

**Validation System:**
- `services/validation.ts` - Centralized validation logic
- `components/ValidationBanner.tsx` - UI component for displaying errors
- `components/ScenarioBuilder.tsx:100-102` - Uses `useDebounce` + `validateScenario`

**Issues:**
- ✅ Validation is centralized - GOOD
- ⚠️ **components/ScenarioBuilder.tsx:100-102:** Validation runs on debounced scenario (300ms delay) - users may not see errors immediately
- ⚠️ **services/validation.ts:80-214:** Validation function is long (134 lines) - could be split by category
- ❌ **No client-side input sanitization:** Users can enter invalid data that only gets caught later

### 3.3 Data Storage

**Storage Locations:**
1. **Supabase** (primary) - `services/supabase.ts`
2. **localStorage** (fallback) - `services/supabase.ts:5-21`
3. **localStorage** (user defaults) - `App.tsx:31`
4. **localStorage** (todos) - `components/Dashboard.tsx:55`

**Issues:**
- ⚠️ **services/supabase.ts:5-21:** Fallback localStorage logic duplicates Supabase structure
- ⚠️ **App.tsx:31:** User defaults in localStorage don't sync across devices
- ⚠️ **components/Dashboard.tsx:55:** Todo list stored separately in localStorage - inconsistent storage pattern
- ❌ **No data migration strategy:** If schema changes, old localStorage data may break

### 3.4 Duplicate Validations

**Found Duplications:**
- ❌ **services/validation.ts:89-96** and **components/ScenarioBuilder.tsx:** Purchase price validation appears in multiple places
- ⚠️ **services/loanMath.ts:114** and **services/validation.ts:** LTV calculation duplicated
- ⚠️ **Multiple components:** DTI calculations appear in `loanMath.ts`, `validation.ts`, and inline in components

---

## 4. UI Consistency

### 4.1 Form Input Styling

**Input Components:**
- `components/CommonInputs.tsx` - `FormattedNumberInput`, `LiveDecimalInput`, `CustomCheckbox`
- Consistent styling via Tailwind classes

**Issues:**
- ✅ Input components are reusable - GOOD
- ⚠️ **components/ScenarioBuilder.tsx:26-29:** Style constants defined at component level - should be in shared constants file
- ⚠️ **components/ScenarioBuilder.tsx:26:** `inputGroupClass` string is very long (200+ chars) - hard to maintain
- ❌ **Inconsistent input heights:** Some inputs use `h-10`, others use `h-11` - no standard

### 4.2 Button Patterns

**Button Usage:**
- Various button styles throughout components
- No centralized button component

**Issues:**
- ❌ **No Button component:** Buttons are styled inline throughout codebase
- ⚠️ **Inconsistent button styles:** Primary actions use different colors/sizes
- ⚠️ **components/Dashboard.tsx:** Buttons have inconsistent padding and hover states

### 4.3 Error Message Handling

**Error Display:**
- `components/ValidationBanner.tsx` - Centralized error/warning display
- `components/Toast.tsx` - Toast notifications for actions
- `index.tsx:7-23` - Global error handler for crashes

**Issues:**
- ✅ Error handling is generally good
- ⚠️ **index.tsx:7-23:** Global error handler uses innerHTML - potential XSS risk
- ⚠️ **components/Auth.tsx:79-88:** Error messages displayed inline - inconsistent with ValidationBanner pattern
- ❌ **No error boundary:** React errors can crash entire app

### 4.4 Loading States

**Loading Indicators:**
- `Loader2` icon from lucide-react used in various places
- `isLoadingData` state in `App.tsx:26`
- `isSyncing` prop in `Dashboard.tsx:26`

**Issues:**
- ⚠️ **Inconsistent loading patterns:** Some use spinners, others use disabled states
- ⚠️ **No loading skeleton:** Large components like `ScenarioBuilder` show blank while loading
- ❌ **No optimistic updates:** Saves show loading but don't update UI optimistically

---

## 5. Configuration Management

### 5.1 Environment Variables

**Current Env Vars:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OPENAI_API_KEY` / `OPENAI_API_KEY` (inconsistent naming)
- `VITE_FANNIE_MAE_API_KEY` / `FANNIE_MAE_API_KEY` (inconsistent naming)
- `VITE_GEMINI_API_KEY` (appears unused)

**Issues:**
- ❌ **Inconsistent naming:** Some use `VITE_` prefix, others don't
- ❌ **api/generate-scenario-name.ts:20:** Checks both `VITE_OPENAI_API_KEY` and `OPENAI_API_KEY` - confusing
- ⚠️ **vite.config.ts:14-15:** Hardcodes `GEMINI_API_KEY` in build config - should use env vars
- ❌ **No .env.example file:** Developers don't know what env vars are needed

### 5.2 Guild Mortgage Branding

**Hardcoded Branding:**
- `services/preApprovalPDF.ts:4-8` - Brand color `#1f3b83`
- `services/preApprovalPDF.ts:17-24` - Officer info (John Creager, NMLS #2098333)
- `services/preApprovalPDF.ts:11-14` - Legal footer text
- `public/john_creager_guild.png` - Logo file

**Issues:**
- ❌ **services/preApprovalPDF.ts:4-24:** All branding hardcoded - not configurable
- ❌ **No branding configuration file:** Should be in `constants.ts` or separate config
- ⚠️ **Logo path hardcoded:** `services/preApprovalPDF.ts` references logo but path may break

### 5.3 Validation Thresholds

**Location:** `services/validation.ts:70-78`

**Current Thresholds:**
```typescript
purchasePriceMin: 50000
interestRateMin: 2
interestRateMax: 12
dtiFrontEndWarning: 43
dtiBackEndMax: 50
creditScoreFhaMin: 580
creditScoreConventionalMin: 620
```

**Issues:**
- ✅ Thresholds are centralized - GOOD
- ⚠️ **services/validation.ts:70-78:** Defaults are hardcoded - should allow user override
- ✅ **App.tsx:30-44:** User can override thresholds via localStorage - GOOD
- ⚠️ **No validation of threshold values:** User could set invalid thresholds (e.g., min > max)

---

## 6. Code Organization

### 6.1 Components That Should Be Split

**Critical:**
1. **`components/ScenarioBuilder.tsx` (2651+ lines)**
   - Should be split into:
     - `ScenarioBuilderHeader.tsx` - Header section
     - `LoanDetailsTab.tsx` - Loan tab content
     - `CostsTab.tsx` - Costs tab content
     - `IncomeTab.tsx` - Income tab content
     - `AdvancedTab.tsx` - Advanced tab content
     - `ScenarioSidebar.tsx` - Right sidebar with breakdown
     - `ScenarioBuilder.tsx` - Main orchestrator (should be < 300 lines)

2. **`components/Dashboard.tsx` (1026+ lines)**
   - Should be split into:
     - `ClientSidebar.tsx` - Left sidebar
     - `ScenarioList.tsx` - Main scenario grid
     - `ScenarioCard.tsx` - Individual scenario card
     - `SettingsModal.tsx` - Settings modal
     - `Dashboard.tsx` - Main orchestrator

3. **`App.tsx` (421+ lines)**
   - Should extract:
     - `AuthGuard.tsx` - Authentication wrapper
     - `DataProvider.tsx` - Data fetching logic
     - Keep `App.tsx` minimal

### 6.2 Utility Functions That Should Be Extracted

**Missing Utilities:**
1. **Money Formatting:**
   - `formatMoney()` function used inline throughout
   - Should be in `utils/formatting.ts`

2. **Date Formatting:**
   - `formatDate()` in `preApprovalPDF.ts:65-71`
   - Should be in `utils/formatting.ts`

3. **Number Parsing:**
   - `safeNum()` in `loanMath.ts:13-16`
   - Should be in `utils/numbers.ts`

4. **Validation Helpers:**
   - LTV calculation, DTI calculation
   - Should be in `utils/calculations.ts`

### 6.3 Duplicate Code Across Pages

**Found Duplications:**

1. **Money Formatting:**
   - `services/preApprovalPDF.ts:46-48` - `formatCurrency()`
   - Multiple `toLocaleString()` calls in components
   - **Fix:** Create `utils/formatMoney.ts`

2. **Percentage Calculations:**
   - `components/ScenarioBuilder.tsx:524-555` - `toggleCostFixed()`
   - Similar logic in `loanMath.ts:290-297`
   - **Fix:** Extract to `utils/percentage.ts`

3. **Scenario Defaults:**
   - `App.tsx:32-43` - Default scenario structure
   - `constants.ts:45-115` - `DEFAULT_SCENARIO`
   - **Fix:** Use only `constants.ts`

4. **Error Handling:**
   - `index.tsx:7-23` - Global error handler
   - `index.html:96-101` - Another error handler
   - **Fix:** Consolidate to one location

---

## 7. Critical Issues Summary

### High Priority

1. **❌ Architecture Mismatch:** User said "Next.js app" but it's actually Vite + React SPA
2. **❌ Massive Components:** `ScenarioBuilder.tsx` (2651 lines) and `Dashboard.tsx` (1026 lines) need splitting
3. **❌ Calculation Duplication:** Closing cost calculations duplicated in 3 places
4. **❌ Hardcoded Branding:** Guild Mortgage info hardcoded in PDF generation
5. **❌ Inconsistent Env Vars:** Mix of `VITE_` prefix and non-prefixed variables

### Medium Priority

6. **⚠️ No Error Boundary:** React errors can crash entire app
7. **⚠️ No Centralized Formatting:** Money/date formatting duplicated
8. **⚠️ Validation Delay:** 300ms debounce means errors show late
9. **⚠️ No Optimistic Updates:** UI doesn't update optimistically on save
10. **⚠️ Memory Usage:** Undo/redo system stores full scenario copies (20 revisions)

### Low Priority

11. **⚠️ Console.log Statements:** 26+ console.log/error statements in production code
12. **⚠️ Dead Code:** `services/geminiService.ts` appears unused
13. **⚠️ Inconsistent Button Styles:** No centralized button component
14. **⚠️ No Loading Skeletons:** Large components show blank while loading

---

## 8. Recommendations

### Immediate Actions

1. **Split Large Components:**
   - Break `ScenarioBuilder.tsx` into 6+ smaller components
   - Break `Dashboard.tsx` into 4+ smaller components

2. **Extract Utilities:**
   - Create `utils/formatting.ts` for money/date formatting
   - Create `utils/calculations.ts` for shared calculation helpers
   - Create `utils/numbers.ts` for number parsing/validation

3. **Fix Calculation Duplication:**
   - Remove duplicate closing cost logic from `ScenarioBuilder.tsx`
   - Use `loanMath.ts` as single source of truth

4. **Centralize Configuration:**
   - Move all hardcoded values to `constants.ts`
   - Create `config/branding.ts` for Guild Mortgage info
   - Standardize environment variable naming

5. **Add Error Boundary:**
   - Implement React Error Boundary component
   - Replace innerHTML error handler with React component

### Medium-Term Improvements

6. **Add Type Safety:**
   - Create proper types for all calculation results
   - Add runtime validation with Zod or similar

7. **Improve State Management:**
   - Consider Zustand or Context API for shared state
   - Reduce prop drilling

8. **Add Testing:**
   - Unit tests for `loanMath.ts` calculations
   - Integration tests for form flows
   - E2E tests for critical paths

9. **Performance Optimization:**
   - Implement React.memo for expensive components
   - Lazy load large components
   - Optimize undo/redo system (store diffs instead of full copies)

### Long-Term Enhancements

10. **Server-Side Validation:**
    - Add API endpoints for calculation validation
    - Prevent client-side manipulation

11. **Data Migration System:**
    - Version scenarios in database
    - Migration scripts for schema changes

12. **Documentation:**
    - Add JSDoc comments to all calculation functions
    - Create architecture diagram
    - Document API endpoints

---

## 9. File Reference Index

### Critical Files to Review

- `components/ScenarioBuilder.tsx` (Lines 1-2651) - **NEEDS SPLITTING**
- `components/Dashboard.tsx` (Lines 1-1026) - **NEEDS SPLITTING**
- `services/loanMath.ts` (Lines 1-519) - **NEEDS REFACTORING**
- `services/validation.ts` (Lines 1-214) - **NEEDS SPLITTING**
- `services/preApprovalPDF.ts` (Lines 1-354) - **HARDCODED BRANDING**
- `App.tsx` (Lines 1-421) - **TOO MUCH LOGIC**

### Configuration Files

- `constants.ts` - Default values and closing costs
- `services/validation.ts:70-78` - Validation thresholds
- `vite.config.ts` - Build configuration

### API Routes

- `api/ai-parse.ts` - OpenAI NLP parsing
- `api/generate-scenario-name.ts` - AI name generation
- `api/fannie-mae-ami.ts` - Fannie Mae API proxy
- `api/generate-submission-pdf.ts` - PDF generation endpoint

---

**End of Audit**

