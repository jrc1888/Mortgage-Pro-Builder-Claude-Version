# Refinance Implementation Plan
## Cash-Out Refinance & Rate-and-Term Refinance

---

## 📋 RESEARCH SUMMARY

### Rate-and-Term Refinance
**Purpose:** Lower interest rate, change loan term, or both without accessing equity

**Structure:**
- **Loan Amount:** Existing loan payoff + closing costs (if financed)
- **LTV Limits:** 
  - Conventional: Up to 97% (with MI) or 80% (without MI)
  - FHA: Up to 97.75% (streamline) or 96.5% (standard)
  - VA: Up to 100% (IRRRL or standard)
- **Cash Out:** $0 (by definition)
- **Closing Costs:** Can be financed or paid in cash
- **Typical Use:** Lower monthly payment, shorter term, remove PMI

### Cash-Out Refinance
**Purpose:** Access home equity for cash

**Structure:**
- **Loan Amount:** Existing loan payoff + closing costs (if financed) + cash out amount
- **LTV Limits:**
  - Conventional: Typically 80% max (can go higher with MI, up to 90-95%)
  - FHA: Up to 80% (cash-out limit)
  - VA: Up to 100% (if sufficient equity)
- **Cash Out:** Loan amount - payoff - closing costs
- **Closing Costs:** Can be financed or paid in cash
- **Typical Use:** Home improvements, debt consolidation, major expenses

---

## ❓ QUESTIONS FOR CLARIFICATION

### 1. Property Value Input
**Current:** `purchasePrice` is used for both purchase and refinance
**Question:** For refinances, should we:
- **Option A:** Rename `purchasePrice` to `propertyValue` (works for both)
- **Option B:** Add separate `appraisedValue` field for refinances
- **Option C:** Keep `purchasePrice` but clarify it represents appraised value for refis

**Recommendation:** Option A - rename to `propertyValue` for clarity

### 2. Existing Loan Payoff
**Question:** Should we:
- **Option A:** Single field `existingLoanPayoff` (total amount to pay off)
- **Option B:** Break down into `existingLoanBalance` + `existingLoanPayoffFees` (prepayment penalties, etc.)
- **Option C:** Support multiple loans to pay off (first + second mortgage)

**Recommendation:** Start with Option A, add Option B later if needed

### 3. Closing Costs Financing
**Question:** Should we:
- **Option A:** Toggle "Finance Closing Costs" (all or nothing)
- **Option B:** Allow partial financing (specify dollar amount to finance)
- **Option C:** Auto-calculate: finance if it keeps loan within LTV limits

**Recommendation:** Option A for MVP, Option C as enhancement

### 4. Cash-Out Calculation Logic
**Your Logic:** 
> "If total (payoff + financed closing costs + cash out) > base loan, cash out gets reduced"

**Question:** Should cash out be:
- **Option A:** User-specified amount (reduced if needed to stay within LTV)
- **Option B:** Calculated as: `maxLoanAmount - payoff - financedClosingCosts`
- **Option C:** Both - user can specify OR calculate maximum

**Recommendation:** Option C - allow both input methods

### 5. LTV Calculation Base
**Question:** For refinances, should LTV be calculated against:
- **Option A:** Appraised value (standard)
- **Option B:** Original purchase price (if no new appraisal)
- **Option C:** User-specified property value

**Recommendation:** Option C - user specifies current property value (appraised or estimated)

---

## 🎯 PROPOSED DATA STRUCTURE

### New Fields in `Scenario` Interface

```typescript
export interface Scenario {
  // ... existing fields ...
  
  transactionType: 'Purchase' | 'Refinance';
  
  // NEW: Refinance-specific fields
  refinanceType?: 'rate_and_term' | 'cash_out'; // Only for Refinance
  propertyValue?: number; // Appraised/estimated value (replaces purchasePrice for refis)
  existingLoanPayoff?: number; // Total amount to pay off existing loan(s)
  cashOutAmount?: number; // Desired cash out (only for cash_out refi)
  financeClosingCosts?: boolean; // Whether to finance closing costs in loan
  
  // Keep for backward compatibility, but use propertyValue for refis
  purchasePrice: number; // Still used for purchases
}
```

### New Fields in `CalculatedResults` Interface

```typescript
export interface CalculatedResults {
  // ... existing fields ...
  
  // NEW: Refinance-specific results
  refinanceDetails?: {
    propertyValue: number;
    existingLoanPayoff: number;
    cashOutAmount: number; // Actual cash out (may be reduced)
    cashOutRequested: number; // Original requested amount
    cashOutReduced: boolean; // Flag if cash out was reduced due to LTV
    netCashToBorrower: number; // Cash out - any cash needed at closing
    totalLoanNeeded: number; // Payoff + closing costs + cash out
  };
}
```

---

## 🔄 PROPOSED CALCULATION LOGIC

### Step-by-Step Refinance Calculation

#### Step 1: Determine Property Value
```typescript
const propertyValue = scenario.transactionType === 'Refinance' 
  ? (scenario.propertyValue || scenario.purchasePrice) // Use propertyValue if set, fallback to purchasePrice
  : scenario.purchasePrice;
```

#### Step 2: Calculate Maximum Loan Amount (Base Loan)
```typescript
// Get max LTV based on loan type and refinance type
const maxLTV = getMaxLTVForRefinance(
  scenario.loanType,
  scenario.refinanceType || 'rate_and_term',
  scenario.creditScore
);

const maxLoanAmount = propertyValue * (maxLTV / 100);
```

#### Step 3: Calculate Existing Loan Payoff
```typescript
const existingLoanPayoff = scenario.existingLoanPayoff || 0;
```

#### Step 4: Calculate Closing Costs
```typescript
// Same as purchase - calculate all closing costs
const totalClosingCosts = calculateClosingCosts(scenario, results);
```

#### Step 5: Determine Financed Closing Costs
```typescript
const financedClosingCosts = scenario.financeClosingCosts 
  ? totalClosingCosts 
  : 0;
```

#### Step 6: Calculate Cash Out (if applicable)
```typescript
let cashOutAmount = 0;
if (scenario.refinanceType === 'cash_out') {
  cashOutAmount = scenario.cashOutAmount || 0;
}
```

#### Step 7: Calculate Total Loan Needed
```typescript
const totalLoanNeeded = existingLoanPayoff + financedClosingCosts + cashOutAmount;
```

#### Step 8: Determine Actual Loan Amount
```typescript
let actualLoanAmount = Math.min(totalLoanNeeded, maxLoanAmount);
```

#### Step 9: Adjust Cash Out if Needed (Cash-Out Refi)
```typescript
if (scenario.refinanceType === 'cash_out') {
  if (totalLoanNeeded > maxLoanAmount) {
    // Reduce cash out to fit within LTV
    const availableForCashOut = maxLoanAmount - existingLoanPayoff - financedClosingCosts;
    cashOutAmount = Math.max(0, availableForCashOut);
    actualLoanAmount = existingLoanPayoff + financedClosingCosts + cashOutAmount;
  }
}
```

#### Step 10: Calculate Cash to Close / Cash to Borrower
```typescript
if (scenario.refinanceType === 'rate_and_term') {
  // Rate and term: borrower may need to bring cash if closing costs aren't financed
  const cashToClose = totalClosingCosts - financedClosingCosts - lenderCredits - sellerCredits;
  // If negative, borrower receives refund (shouldn't happen for rate/term)
} else {
  // Cash-out: borrower receives cash
  const netCashToBorrower = cashOutAmount - (totalClosingCosts - financedClosingCosts - lenderCredits);
  // If negative, borrower needs to bring cash (unusual but possible)
}
```

---

## 📐 LTV RULES FOR REFINANCES

### Function: `getMaxLTVForRefinance()`

```typescript
function getMaxLTVForRefinance(
  loanType: LoanType,
  refinanceType: 'rate_and_term' | 'cash_out',
  creditScore: number
): number {
  if (loanType === LoanType.CONVENTIONAL) {
    if (refinanceType === 'cash_out') {
      // Cash-out: typically 80% max, can go higher with MI
      return creditScore >= 740 ? 80 : 75; // Can be adjusted
    } else {
      // Rate and term: up to 97% with MI
      return 97;
    }
  }
  
  if (loanType === LoanType.FHA) {
    if (refinanceType === 'cash_out') {
      // FHA cash-out: 80% max
      return 80;
    } else {
      // FHA rate and term: 96.5% standard, 97.75% streamline
      return 96.5; // Could add streamline option later
    }
  }
  
  if (loanType === LoanType.VA) {
    // VA: up to 100% for both types (if sufficient equity)
    return 100;
  }
  
  if (loanType === LoanType.JUMBO) {
    // Jumbo: typically 80% for cash-out, 85-90% for rate/term
    return refinanceType === 'cash_out' ? 80 : 85;
  }
  
  return 80; // Default
}
```

---

## 🎨 UI/UX CHANGES NEEDED

### 1. Transaction Type Selection
**Location:** Scenario Builder - Loan Tab
- Keep existing Purchase/Refinance toggle
- **NEW:** When Refinance selected, show sub-option:
  - ○ Rate and Term Refinance
  - ○ Cash-Out Refinance

### 2. Property Value Input (Refinance)
**Location:** Scenario Builder - Loan Tab
- **For Purchase:** Keep "Purchase Price" label
- **For Refinance:** Change to "Property Value" or "Appraised Value"
- Add tooltip: "Current appraised or estimated value of the property"

### 3. Existing Loan Payoff Input
**Location:** Scenario Builder - Loan Tab (new section for Refinance)
- Label: "Existing Loan Payoff"
- Input: Dollar amount
- Tooltip: "Total amount needed to pay off your existing mortgage(s)"
- **Future:** Could add "Breakdown" button to show first + second mortgage

### 4. Cash-Out Amount Input
**Location:** Scenario Builder - Loan Tab (only shown for cash-out refi)
- Label: "Cash Out Amount"
- Input: Dollar amount
- **OR** Toggle: "Calculate Maximum Cash Out"
- Tooltip: "Amount of cash you want to receive. Will be reduced if it exceeds LTV limits."

### 5. Finance Closing Costs Toggle
**Location:** Scenario Builder - Costs Tab
- Toggle: "Finance Closing Costs in Loan"
- Only shown for Refinance scenarios
- Tooltip: "If checked, closing costs will be added to your loan amount (subject to LTV limits)"

### 6. Cash to Close / Cash to Borrower Display
**Location:** Scenario Builder - Sidebar Results
- **Rate and Term:** Show "Cash to Close" (may be $0 if all costs financed)
- **Cash-Out:** Show "Cash to Borrower" prominently
- Add breakdown showing:
  - Loan Amount
  - Less: Existing Loan Payoff
  - Less: Closing Costs (if not financed)
  - Plus: Lender Credits
  - Equals: Cash to Borrower

---

## 🔧 IMPLEMENTATION STEPS

### Phase 1: Data Structure Updates
1. ✅ Update `Scenario` interface with refinance fields
2. ✅ Update `CalculatedResults` interface with refinance details
3. ✅ Create `getMaxLTVForRefinance()` function
4. ✅ Update type definitions

### Phase 2: Calculation Logic
1. ✅ Update `calculateScenario()` to handle refinances
2. ✅ Implement refinance loan amount calculation
3. ✅ Implement cash-out adjustment logic
4. ✅ Update cash-to-close calculation for refinances
5. ✅ Update LTV calculation to use property value

### Phase 3: UI Updates
1. ✅ Add refinance type selection (rate/term vs cash-out)
2. ✅ Update property value input label
3. ✅ Add existing loan payoff input
4. ✅ Add cash-out amount input (conditional)
5. ✅ Add finance closing costs toggle
6. ✅ Update results display for refinances

### Phase 4: Validation & Edge Cases
1. ✅ Add validation for refinance scenarios
2. ✅ Handle edge cases (payoff > property value, etc.)
3. ✅ Add warnings/errors for invalid scenarios
4. ✅ Test with various loan types and LTV scenarios

### Phase 5: APR & Other Calculations
1. ✅ Update APR calculation for refinances
2. ✅ Update DTI calculation (if needed)
3. ✅ Update PDF generation for refinances
4. ✅ Update comparison tool for refinances

---

## ⚠️ EDGE CASES TO HANDLE

### 1. Payoff Exceeds Property Value
**Scenario:** Existing loan payoff > property value (underwater)
**Handling:** Show error - cannot refinance underwater property (unless HARP/streamline)

### 2. Total Needed Exceeds Max LTV
**Scenario:** Payoff + closing costs + cash out > max loan amount
**Handling:** 
- Reduce cash out (if cash-out refi)
- OR require borrower to pay closing costs in cash
- Show warning with options

### 3. Negative Cash to Borrower
**Scenario:** Closing costs > cash out amount
**Handling:** Show "Cash Needed at Closing" instead of "Cash to Borrower"

### 4. No Cash Out but Loan Exceeds Payoff
**Scenario:** Rate/term refi where loan > payoff (due to financed costs)
**Handling:** This is normal - show breakdown clearly

### 5. Multiple Existing Loans
**Scenario:** Borrower has first + second mortgage
**Handling:** For MVP, combine into single payoff. Future: allow breakdown.

---

## 📊 EXAMPLE CALCULATIONS

### Example 1: Rate and Term Refinance
```
Property Value: $500,000
Existing Loan Payoff: $350,000
Closing Costs: $5,000
Finance Closing Costs: Yes
Max LTV: 97%

Calculation:
- Max Loan Amount: $500,000 × 97% = $485,000
- Total Needed: $350,000 + $5,000 = $355,000
- Actual Loan Amount: $355,000 (within limit)
- Cash to Close: $0 (all costs financed)
```

### Example 2: Cash-Out Refinance (Within Limits)
```
Property Value: $500,000
Existing Loan Payoff: $300,000
Closing Costs: $5,000
Finance Closing Costs: Yes
Cash Out Requested: $50,000
Max LTV: 80%

Calculation:
- Max Loan Amount: $500,000 × 80% = $400,000
- Total Needed: $300,000 + $5,000 + $50,000 = $355,000
- Actual Loan Amount: $355,000 (within limit)
- Cash to Borrower: $50,000
```

### Example 3: Cash-Out Refinance (Exceeds Limits - Cash Out Reduced)
```
Property Value: $500,000
Existing Loan Payoff: $350,000
Closing Costs: $5,000
Finance Closing Costs: Yes
Cash Out Requested: $100,000
Max LTV: 80%

Calculation:
- Max Loan Amount: $500,000 × 80% = $400,000
- Total Needed: $350,000 + $5,000 + $100,000 = $455,000
- Exceeds max by: $55,000
- Available for Cash Out: $400,000 - $350,000 - $5,000 = $45,000
- Actual Loan Amount: $400,000
- Cash Out (reduced): $45,000
- Show Warning: "Cash out reduced from $100,000 to $45,000 due to LTV limits"
```

---

## 🎯 RECOMMENDATIONS & SUGGESTIONS

### 1. Property Value Field
**Suggestion:** Rename `purchasePrice` to `propertyValue` for clarity
- More accurate for refinances
- Still works for purchases
- Less confusing for users

### 2. Cash-Out Calculation Method
**Suggestion:** Offer two modes:
- **Mode 1:** User specifies desired cash out (we adjust if needed)
- **Mode 2:** Calculate maximum available cash out
- Toggle between modes in UI

### 3. Closing Costs Financing
**Suggestion:** Smart default:
- If financing costs keeps loan within LTV: default to "Yes"
- If financing costs would exceed LTV: default to "No" and show warning
- User can override

### 4. Validation Messages
**Suggestion:** Clear, actionable messages:
- "Your requested cash out of $X exceeds available equity. Maximum cash out: $Y"
- "To receive $X cash out, you'll need to pay $Y in closing costs at closing"
- "Loan amount exceeds maximum LTV. Consider reducing cash out or paying closing costs in cash."

### 5. Results Display
**Suggestion:** Prominent display of:
- **Rate/Term:** "New Monthly Payment: $X (vs $Y current)" - show savings
- **Cash-Out:** "Cash You'll Receive: $X" - large, prominent
- Breakdown showing: Loan → Payoff → Costs → Cash

---

## ❓ QUESTIONS FOR YOU

1. **Property Value:** Should we rename `purchasePrice` to `propertyValue`, or keep both fields?

2. **Cash-Out Input:** Do you prefer user-specified amount (with auto-reduction) or calculated maximum, or both?

3. **Closing Costs:** All-or-nothing financing, or allow partial?

4. **Multiple Loans:** Should we support first + second mortgage breakdown in MVP, or combine into single payoff?

5. **LTV Limits:** Should these be configurable per lender, or use standard industry limits?

6. **Rate Adjustment:** Should cash-out refis show higher interest rate (typically 0.25-0.50% higher)?

---

## 🚀 NEXT STEPS

Once you answer the questions above, I'll:
1. Finalize the data structure
2. Implement the calculation logic
3. Update the UI components
4. Add validation and error handling
5. Test with various scenarios

**Ready to proceed when you are!** 🎯

