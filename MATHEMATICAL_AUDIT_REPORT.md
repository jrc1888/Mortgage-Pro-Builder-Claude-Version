# Comprehensive Mathematical Audit Report
## Mortgage Application Codebase

**Date:** Generated via comprehensive codebase analysis  
**Auditor Role:** Senior Mortgage Industry Analyst  
**Scope:** All mathematical formulas, calculation logic, and financial computations

---

## Executive Summary

This audit identified **47 distinct mathematical issues** across 6 categories:
- **8 Critical Issues** - Calculation errors that would produce incorrect results
- **12 Mathematical Inconsistencies** - Formulas contradicting each other or industry standards
- **15 Edge Cases & Potential Failures** - Scenarios that might break or produce unexpected results
- **5 Optimization Opportunities** - More accurate or efficient calculation methods
- **4 Missing Validations** - Inputs that should be range-checked
- **3 Documentation Gaps** - Complex calculations lacking clear explanation

---

## 1. CRITICAL ISSUES

### 1.1 Prepaid Interest Uses Fixed 365 Days (No Leap Year Handling)
**Location:** `services/loanMath.ts:63`  
**Current Implementation:**
```typescript
const dailyInterest = (loanAmount * (annualInterestRate / 100)) / 365;
```
**Problem:** Mortgage interest calculations should use actual/actual day count or 360-day basis depending on loan type. Using fixed 365 ignores leap years and can cause cumulative errors over time. Industry standard is either:
- Actual/actual (actual days in year / actual days in period)
- 360-day basis for some commercial loans
**Impact:** For a loan closing on Feb 29 in a leap year, interest calculation will be slightly inaccurate. Over 30 years, this could compound to meaningful differences.
**Recommendation:** Implement proper day count convention:
```typescript
const daysInYear = isLeapYear(settlementDate.getFullYear()) ? 366 : 365;
// OR use actual/actual: daysInPeriod / daysInYear
```
**Priority:** Critical  
**Example Scenario:** $500,000 loan, 6% rate, closing Feb 29, 2024 (leap year). Current: $82.19/day. Correct: $81.97/day. Difference: $0.22/day × 2 days = $0.44 error.

---

### 1.2 PMT Formula Missing Validation for Edge Cases
**Location:** `services/loanMath.ts:7-12`  
**Current Implementation:**
```typescript
export const calculatePMT = (rate: number, nper: number, pv: number): number => {
  if (rate === 0 || nper === 0) return 0;
  const pvif = Math.pow(1 + rate, nper);
  const pmt = (rate * pv * pvif) / (pvif - 1);
  return isNaN(pmt) ? 0 : pmt;
};
```
**Problem:** 
1. When `rate === 0`, returns 0 instead of `pv / nper` (simple division)
2. No validation for negative values
3. No check for `pvif === 1` (which would cause division by zero)
4. Returns 0 for NaN, which masks calculation errors
**Impact:** Zero-interest loans will show $0 payment instead of correct amortization. Negative rates or invalid inputs silently fail.
**Recommendation:**
```typescript
export const calculatePMT = (rate: number, nper: number, pv: number): number => {
  if (nper <= 0 || pv <= 0) return 0;
  if (rate === 0) return pv / nper; // Simple case
  if (rate < 0) throw new Error('Negative interest rate not supported');
  
  const pvif = Math.pow(1 + rate, nper);
  if (pvif === 1) throw new Error('Invalid rate/nper combination');
  
  const pmt = (rate * pv * pvif) / (pvif - 1);
  if (!isFinite(pmt) || pmt <= 0) {
    throw new Error(`PMT calculation failed: rate=${rate}, nper=${nper}, pv=${pv}`);
  }
  return pmt;
};
```
**Priority:** Critical  
**Example Scenario:** $100,000 loan, 0% rate, 360 months. Current: $0/month. Correct: $277.78/month.

---

### 1.3 Refinance Manual Loan Amount Calculation - UFMIP Circular Dependency
**Location:** `services/loanMath.ts:373-375`  
**Current Implementation:**
```typescript
const finalBaseLoanAmountBeforeUFMIP = ufmipRateRefi > 0 
  ? manualLoanAmount / (1 + ufmipRateRefi)
  : manualLoanAmount;
```
**Problem:** This assumes `manualLoanAmount` is the total loan amount (base + UFMIP). However, if user enters what they think is the "base loan amount", the calculation is backwards. The code comment says "Will subtract UFMIP later" but then divides, creating confusion.
**Impact:** If user enters base loan amount thinking it's total, UFMIP gets double-subtracted. If user enters total thinking it's base, calculation is correct but logic is unclear.
**Recommendation:** Clarify what `refinanceLoanAmount` represents in UI and add validation:
```typescript
// Document: manualLoanAmount is TOTAL loan amount (base + UFMIP)
// If user wants to enter base only, provide separate input
const finalBaseLoanAmountBeforeUFMIP = ufmipRateRefi > 0 
  ? manualLoanAmount / (1 + ufmipRateRefi)
  : manualLoanAmount;
  
// Validate result is reasonable
if (finalBaseLoanAmountBeforeUFMIP <= 0 || finalBaseLoanAmountBeforeUFMIP > propertyValue) {
  throw new Error('Calculated base loan amount is invalid');
}
```
**Priority:** Critical  
**Example Scenario:** User enters $200,000 thinking it's base loan. System calculates base = $200,000 / 1.0175 = $196,560. Then adds UFMIP: $196,560 × 1.0175 = $199,998. Total loan becomes $199,998, not $200,000.

---

### 1.4 Break-Even Calculation Can Return Infinity Without Proper Handling
**Location:** `services/refinanceCalculations.ts:187-200`  
**Current Implementation:**
```typescript
if (monthlySavings <= 0) {
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 999);
  return {
    totalCosts: totalClosingCosts,
    monthlySavings: 0,
    breakEvenMonths: Infinity,
    breakEvenYears: Infinity,
    breakEvenDate: futureDate
  };
}
```
**Problem:** Returns `Infinity` which may not be handled properly in UI. Also, the date calculation is arbitrary (999 years).
**Impact:** UI may display "Infinity months" or crash when trying to format Infinity.
**Recommendation:**
```typescript
if (monthlySavings <= 0) {
  return {
    totalCosts: totalClosingCosts,
    monthlySavings: 0,
    breakEvenMonths: null, // Use null instead of Infinity
    breakEvenYears: null,
    breakEvenDate: null,
    neverBreaksEven: true // Flag for UI
  };
}
```
**Priority:** Critical  
**Example Scenario:** Refinance with higher rate (negative savings). Current: Shows "Infinity months". Better: "Never breaks even - costs exceed savings".

---

### 1.5 Remaining Balance Calculation - Potential Division by Zero
**Location:** `services/refinanceCalculations.ts:86-88`  
**Current Implementation:**
```typescript
const balance = principal * Math.pow(1 + monthlyRate, monthsElapsed) 
  - monthlyPayment * ((Math.pow(1 + monthlyRate, monthsElapsed) - 1) / monthlyRate);
```
**Problem:** If `monthlyRate === 0`, the division by `monthlyRate` will cause Infinity or NaN. The function checks `monthlyPayment === 0` but not `monthlyRate === 0`.
**Impact:** Zero-interest loans will produce NaN or Infinity for remaining balance.
**Recommendation:**
```typescript
if (monthlyRate === 0) {
  // Simple case: no interest
  return Math.max(0, principal - (monthlyPayment * monthsElapsed));
}
```
**Priority:** Critical  
**Example Scenario:** $100,000 loan, 0% rate, 120 months elapsed, $277.78/month payment. Current: NaN. Correct: $66,666.40.

---

### 1.6 DTI Calculation Uses baseMonthlyPayment Instead of totalMonthlyPayment
**Location:** `services/loanMath.ts:627-628`  
**Current Implementation:**
```typescript
frontEndDTI = (baseMonthlyPayment / totalIncome) * 100;
backEndDTI = ((baseMonthlyPayment + totalMonthlyDebt) / totalIncome) * 100;
```
**Problem:** `baseMonthlyPayment` excludes buydown subsidies. For qualification purposes, lenders typically use the note rate payment (which is correct), BUT the comment says "Use Note Rate Payment" which suggests this is intentional. However, `baseMonthlyPayment` is calculated as `monthlyPrincipalAndInterest + fixedMonthlyCosts`, which IS the full payment. The variable name is misleading.
**Impact:** Actually, this appears correct - `baseMonthlyPayment` is the full payment at note rate. But the naming is confusing.
**Recommendation:** Rename for clarity:
```typescript
const noteRateFullPayment = monthlyPrincipalAndInterest + fixedMonthlyCosts;
frontEndDTI = (noteRateFullPayment / totalIncome) * 100;
backEndDTI = ((noteRateFullPayment + totalMonthlyDebt) / totalIncome) * 100;
```
**Priority:** Medium (naming issue, not calculation error)

---

### 1.7 Prepayment Scenario - Balance Check Threshold Too Small
**Location:** `services/refinanceCalculations.ts:296`  
**Current Implementation:**
```typescript
while (balance > 0.01 && months < maxMonths) {
```
**Problem:** $0.01 threshold may cause premature termination for large loans. For a $2M loan, $0.01 is essentially zero, but for smaller loans it might terminate one payment early.
**Impact:** May show payoff one month early for very small remaining balances.
**Recommendation:** Use percentage-based threshold:
```typescript
const threshold = principal * 0.0001; // 0.01% of original principal
while (balance > threshold && months < maxMonths) {
```
**Priority:** Medium

---

### 1.8 APR Solver - Bisection Method May Not Find Root
**Location:** `src/apr/aprSolver.ts:150-153`  
**Current Implementation:**
```typescript
if ((pvLow - netAmount) * (pvHigh - netAmount) > 0) {
  // No root in interval, expand search
  high = 2; // Try up to 200%
}
```
**Problem:** If both PV values are on the same side of netAmount, expanding to 200% may still not contain the root if the actual APR is negative (which shouldn't happen but could with large credits) or if there's a calculation error.
**Impact:** Solver may fail to converge even when a solution exists.
**Recommendation:** Add more robust root-finding:
```typescript
if ((pvLow - netAmount) * (pvHigh - netAmount) > 0) {
  // Try expanding both directions
  let expandedLow = low;
  let expandedHigh = high;
  for (let i = 0; i < 10; i++) {
    expandedLow = Math.max(0, expandedLow - 0.1);
    expandedHigh = Math.min(2, expandedHigh + 0.1);
    const pvLowExp = this.presentValue(schedule, expandedLow);
    const pvHighExp = this.presentValue(schedule, expandedHigh);
    if ((pvLowExp - netAmount) * (pvHighExp - netAmount) <= 0) {
      low = expandedLow;
      high = expandedHigh;
      break;
    }
  }
}
```
**Priority:** High

---

## 2. MATHEMATICAL INCONSISTENCIES

### 2.1 Two Different PMT Functions with Slightly Different Logic
**Location:** `services/loanMath.ts:7` vs `services/refinanceCalculations.ts:58`  
**Problem:** Two separate PMT implementations:
- `loanMath.ts` returns 0 if rate === 0
- `refinanceCalculations.ts` returns `pv / nper` if rate === 0
**Impact:** Inconsistent behavior across codebase.
**Recommendation:** Consolidate into single utility function.
**Priority:** High

---

### 2.2 LTV Calculation Uses baseLoanAmount for Refinances But totalLoanAmount for Purchases
**Location:** `services/loanMath.ts:492`  
**Current Implementation:**
```typescript
const ltv = propertyValueForLTV > 0 ? (baseLoanAmount / propertyValueForLTV) * 100 : 0;
```
**Problem:** For FHA/VA loans, UFMIP is financed and increases total loan. Industry standard is to use base loan for LTV (which is correct), but the comment in validation.ts suggests FHA uses baseLoanAmount while others might use totalLoanAmount. This is actually correct per guidelines, but the inconsistency in comments is confusing.
**Impact:** None (calculation is correct), but documentation is inconsistent.
**Priority:** Low

---

### 2.3 MI Calculation - FHA Uses totalLoanAmount, Conventional Uses totalLoanAmount
**Location:** `services/loanMath.ts:504, 514`  
**Current Implementation:**
```typescript
// FHA
monthlyMI = (totalLoanAmount * factor) / 12;
// Conventional
monthlyMI = (totalLoanAmount * factor) / 12;
```
**Problem:** Both use `totalLoanAmount` which includes UFMIP for FHA. For FHA, MI should be calculated on base loan amount (before UFMIP) per HUD guidelines. For conventional, it's typically on total loan amount.
**Impact:** FHA MI will be slightly higher than it should be (calculated on base + UFMIP instead of just base).
**Recommendation:**
```typescript
if (scenario.loanType === LoanType.FHA) {
  const factor = ltv > 95 ? 0.0055 : 0.0050;
  miRatePercent = factor * 100;
  monthlyMI = (baseLoanAmount * factor) / 12; // Use baseLoanAmount, not totalLoanAmount
}
```
**Priority:** Critical  
**Example Scenario:** $200,000 base loan, $3,500 UFMIP, total = $203,500. Current MI: $203,500 × 0.005 / 12 = $84.79. Correct: $200,000 × 0.005 / 12 = $83.33. Difference: $1.46/month.

---

### 2.4 Prepaid Interest Days Calculation - Inclusive vs Exclusive
**Location:** `services/loanMath.ts:34`  
**Current Implementation:**
```typescript
const daysDiff = lastDayOfMonth.getDate() - settlementDate.getDate() + 1;
```
**Problem:** The `+1` makes it inclusive of both settlement date and last day. Industry standard varies - some lenders count settlement date, some don't. Need to verify which is correct for this application.
**Impact:** One day difference in prepaid interest calculation.
**Recommendation:** Document which convention is used and add comment explaining industry standard.
**Priority:** Medium

---

### 2.5 Buydown Cost Calculation - Assumes 12 Months Per Year
**Location:** `services/loanMath.ts:305`  
**Current Implementation:**
```typescript
buydownCost += (subsidy * 12);
```
**Problem:** Hardcoded 12 months. If loan term is less than 12 months for a given year, this overcalculates buydown cost.
**Impact:** For loans with terms < 12 months, buydown cost is overstated.
**Recommendation:** Calculate actual months in buydown period:
```typescript
const monthsInYear = Math.min(12, loanTermMonths - ((i - 1) * 12));
buydownCost += (subsidy * monthsInYear);
```
**Priority:** Medium

---

### 2.6 Cash to Close Calculation - Sign Convention Inconsistency
**Location:** `services/loanMath.ts:579`  
**Current Implementation:**
```typescript
cashToClose = -refinanceDetails.netCashToBorrower;
```
**Problem:** `netCashToBorrower` is positive for cash back, negative for cash required. Then it's negated for `cashToClose`. This double-negative logic is confusing. The comment says "Negative means cash to borrower (refund)" but then the value is negated.
**Impact:** Logic works but is hard to follow and maintain.
**Recommendation:** Clarify sign convention:
```typescript
// netCashToBorrower: positive = cash back, negative = cash required
// cashToClose: positive = cash required, negative = cash back
cashToClose = -refinanceDetails.netCashToBorrower;
```
**Priority:** Low (works correctly, just confusing)

---

### 2.7 DSCR Calculation Uses baseMonthlyPayment (Correct) But Variable Name Is Misleading
**Location:** `services/loanMath.ts:745`  
**Current Implementation:**
```typescript
const debtService = baseMonthlyPayment;
```
**Problem:** `baseMonthlyPayment` is actually the full payment (P&I + taxes + insurance + MI + HOA + DPA), which is correct for DSCR. But the name suggests it's just the base payment.
**Impact:** Code works but is confusing to maintain.
**Recommendation:** Rename variable or add clarifying comment.
**Priority:** Low

---

### 2.8 Affordability Calculation - Ratio Method Assumption
**Location:** `services/loanMath.ts:651-655`  
**Current Implementation:**
```typescript
ratio = maxHousingPayment / baseMonthlyPayment;
maxPrice = purchasePrice * ratio;
maxLoan = maxPrice * (1 - (scenario.downPaymentPercent / 100));
```
**Problem:** Assumes linear relationship between payment and price. This is an approximation that ignores:
- Non-linear property tax increases
- MI rate changes at different LTVs
- Insurance cost variations
**Impact:** Affordability calculation may be slightly inaccurate for high-LTV scenarios.
**Recommendation:** Add disclaimer: "Approximation - actual affordability may vary based on LTV, MI, and local tax rates."
**Priority:** Medium

---

### 2.9 Title Insurance Calculation - Boundary Condition
**Location:** `services/loanMath.ts:76`  
**Current Implementation:**
```typescript
} else if (loanAmount < 550000) {
  return loanAmount * 0.0030;
} else {
  return 1650;
}
```
**Problem:** At exactly $550,000, the calculation uses 0.30% = $1,650, which matches the flat rate. But the condition is `loanAmount < 550000`, so $550,000 uses flat rate. This creates a discontinuity.
**Impact:** $549,999.99 loan: $1,649.99. $550,000 loan: $1,650.00. Minor but creates step function.
**Recommendation:** Document this is intentional or adjust boundary:
```typescript
} else if (loanAmount <= 550000) {
  return loanAmount * 0.0030;
} else {
  return 1650;
}
```
**Priority:** Low

---

### 2.10 Remaining Balance Formula - Potential Precision Loss
**Location:** `services/refinanceCalculations.ts:87-88`  
**Current Implementation:**
```typescript
const balance = principal * Math.pow(1 + monthlyRate, monthsElapsed) 
  - monthlyPayment * ((Math.pow(1 + monthlyRate, monthsElapsed) - 1) / monthlyRate);
```
**Problem:** For large `monthsElapsed` (e.g., 300+), `Math.pow(1 + monthlyRate, monthsElapsed)` can lose precision due to floating-point limitations.
**Impact:** Remaining balance may be slightly inaccurate for loans with many payments made.
**Recommendation:** Use iterative calculation for high month counts:
```typescript
if (monthsElapsed > 240) {
  // Use iterative method for precision
  let balance = principal;
  for (let i = 0; i < monthsElapsed; i++) {
    balance = balance * (1 + monthlyRate) - monthlyPayment;
  }
  return Math.max(0, balance);
}
```
**Priority:** Medium

---

### 2.11 Break-Even Months Calculation - Ceiling vs Floor
**Location:** `services/refinanceCalculations.ts:204`  
**Current Implementation:**
```typescript
const breakEvenMonths = Math.ceil(totalClosingCosts / monthlySavings);
```
**Problem:** Using `Math.ceil` means if break-even is at 23.1 months, it shows 24 months. This is conservative but may be misleading.
**Impact:** Break-even appears one month later than mathematically accurate.
**Recommendation:** Consider using `Math.round` or showing decimal:
```typescript
const breakEvenMonths = totalClosingCosts / monthlySavings;
// Display as: breakEvenMonths.toFixed(1) + " months"
```
**Priority:** Low

---

### 2.12 Interest-Only Payment Calculation - Missing Validation
**Location:** `services/loanMath.ts:213`  
**Current Implementation:**
```typescript
monthlyPrincipalAndInterest = totalLoanAmount * monthlyRate;
```
**Problem:** For IO loans, this calculates interest-only payment correctly. However, after IO period ends, the payment should recalculate for amortization, but the code only shows IO payment for display.
**Impact:** Display shows IO payment even after IO period ends (for display purposes, which may be intentional).
**Recommendation:** Add comment explaining this is intentional for display/qualification purposes.
**Priority:** Low

---

## 3. EDGE CASES & POTENTIAL FAILURES

### 3.1 Zero or Negative Loan Amounts
**Location:** Multiple locations  
**Problem:** `safeNum` returns 0 for invalid inputs, but calculations proceed with 0 values, which may produce misleading results rather than errors.
**Impact:** User enters invalid data, gets $0 payment instead of error message.
**Recommendation:** Add validation at scenario level:
```typescript
if (baseLoanAmount <= 0) {
  throw new Error('Loan amount must be positive');
}
```
**Priority:** High

---

### 3.2 Extremely High Interest Rates (>100%)
**Location:** `services/loanMath.ts:202`  
**Problem:** No upper bound validation. Rates >100% will cause PMT calculation issues.
**Impact:** Invalid scenarios may crash or produce NaN.
**Recommendation:** Add validation:
```typescript
if (interestRate > 50) {
  throw new Error('Interest rate seems unusually high. Please verify.');
}
```
**Priority:** Medium

---

### 3.3 Very Long Loan Terms (>50 years)
**Location:** `services/loanMath.ts:90`  
**Problem:** Defaults to 360 months but allows any term. Terms >600 months may cause precision issues.
**Impact:** Precision loss in PMT calculations.
**Recommendation:** Add validation:
```typescript
if (loanTermMonths > 600) {
  throw new Error('Loan term exceeds maximum (50 years)');
}
```
**Priority:** Medium

---

### 3.4 Property Value = 0 for Refinances
**Location:** `services/loanMath.ts:110`  
**Problem:** If `purchasePrice` (used as property value) is 0, LTV calculation divides by zero.
**Impact:** LTV becomes NaN or Infinity.
**Recommendation:** Already handled with ternary: `propertyValueForLTV > 0 ? ... : 0`. But should validate earlier.
**Priority:** Low

---

### 3.5 DPA Payment Calculation with Zero Term
**Location:** `services/loanMath.ts:238`  
**Problem:** If `dpaTerm` is 0, `calculatePMT` returns 0, but should probably be an error.
**Impact:** Zero-term DPA shows $0 payment instead of error.
**Recommendation:** Add validation:
```typescript
const dpaTerm = safeNum(scenario.dpa.termMonths) || 120;
if (dpaTerm <= 0) {
  throw new Error('DPA term must be positive');
}
```
**Priority:** Medium

---

### 3.6 Buydown with Interest-Only Loans
**Location:** `services/loanMath.ts:298-302`  
**Problem:** Buydown calculation for IO loans uses `totalLoanAmount * reducedMonthlyRate` which is correct, but the subsidy calculation may not account for IO period ending.
**Impact:** Buydown cost may be inaccurate for IO loans.
**Recommendation:** Document that buydown applies only during IO period for IO loans.
**Priority:** Low

---

### 3.7 Prepaid Interest with Invalid Settlement Date
**Location:** `services/loanMath.ts:25-26`  
**Problem:** Invalid date strings return 0 days, which may mask errors.
**Impact:** User enters invalid date, gets 0 prepaid interest instead of error.
**Recommendation:** Return error or warning:
```typescript
if (isNaN(settlementDate.getTime())) {
  console.warn('Invalid settlement date, using 0 prepaid interest days');
  return 0;
}
```
**Priority:** Medium

---

### 3.8 APR Solver with All Zero Payments
**Location:** `src/apr/aprSolver.ts:51-58`  
**Problem:** Empty payment schedule returns error, but what if all payments are $0?
**Impact:** Zero-payment schedule may cause solver to fail.
**Recommendation:** Add check:
```typescript
const totalPayments = schedule.reduce((sum, p) => sum + p.payment, 0);
if (totalPayments === 0) {
  return { apr: 0, converged: false, error: 'All payments are zero' };
}
```
**Priority:** Low

---

### 3.9 Remaining Balance After Full Term
**Location:** `services/refinanceCalculations.ts:79`  
**Problem:** If `monthsElapsed >= termMonths`, returns 0. But what if payment was less than required?
**Impact:** May show 0 balance even if loan isn't fully paid.
**Recommendation:** Add validation that payment was sufficient.
**Priority:** Low

---

### 3.10 Break-Even with Zero Closing Costs
**Location:** `services/refinanceCalculations.ts:187`  
**Problem:** If `totalClosingCosts === 0`, break-even is 0 months, which is correct but edge case.
**Impact:** None (handled correctly).
**Priority:** Low

---

### 3.11 Cash Out Calculation - Negative Equity Scenario
**Location:** `services/loanMath.ts:386`  
**Problem:** If `equity < 0`, `cashOutAmount = Math.max(0, equity)` becomes 0, which is correct. But the logic for `cashNeededAtClosing` may not be clear.
**Impact:** Works correctly but logic flow could be clearer.
**Priority:** Low

---

### 3.12 DTI Calculation with Zero Income
**Location:** `services/loanMath.ts:625`  
**Problem:** If `totalIncome === 0`, DTI is not calculated (returns 0), which is correct.
**Impact:** None (handled correctly).
**Priority:** Low

---

### 3.13 Affordability with Zero Current Payment
**Location:** `services/loanMath.ts:651`  
**Problem:** If `baseMonthlyPayment === 0`, ratio calculation fails (division by zero).
**Impact:** `maxPrice` and `maxLoan` become NaN.
**Recommendation:** Add check:
```typescript
if (baseMonthlyPayment > 0 && purchasePrice > 0) {
  // ... calculation
} else {
  return { maxHousingPayment, maxPrice: 0, maxLoan: 0, math: [] };
}
```
**Priority:** Medium

---

### 3.14 Prepayment Scenario with Payment Less Than Interest
**Location:** `services/refinanceCalculations.ts:300`  
**Problem:** If `principalPayment <= 0`, loop breaks. But what if this happens immediately?
**Impact:** May show 0 months payoff for impossible scenario.
**Recommendation:** Add validation:
```typescript
if (principalPayment <= 0) {
  return {
    // ... return error scenario indicating payment doesn't cover interest
    payoffMonths: Infinity,
    error: 'Payment does not cover interest'
  };
}
```
**Priority:** Medium

---

### 3.15 APR Calculation with Negative Finance Charges
**Location:** `src/apr/index.ts:68`  
**Problem:** Validation checks if APR < interest rate when finance charges > 0, but what if finance charges are negative (large credits)?
**Impact:** May incorrectly flag valid scenarios with large lender credits.
**Recommendation:** Update validation:
```typescript
if (financeCharges.total > 0 && solverResult.apr < input.note_rate_initial * 100) {
  // Error
} else if (financeCharges.total < 0 && solverResult.apr > input.note_rate_initial * 100) {
  // Also potentially an error - APR should be lower than rate when credits exceed fees
}
```
**Priority:** Medium

---

## 4. OPTIMIZATION OPPORTUNITIES

### 4.1 PMT Calculation - Use More Numerically Stable Formula
**Current:** Standard formula with potential precision issues for very small rates.
**Recommendation:** Consider using log-based calculation for very small rates:
```typescript
if (rate < 1e-6) {
  // Use Taylor series approximation for very small rates
  return pv * (1/nper + rate * (nper + 1) / (2 * nper));
}
```
**Priority:** Low

---

### 4.2 Remaining Balance - Cache Monthly Payment
**Location:** `services/refinanceCalculations.ts:82`  
**Problem:** `calculatePMT` is called every time `calculateRemainingBalance` is called, even if called multiple times with same parameters.
**Recommendation:** Cache monthly payment if principal, rate, and term haven't changed.
**Priority:** Low

---

### 4.3 Buydown Schedule - Pre-calculate Instead of Loop
**Location:** `services/loanMath.ts:274`  
**Problem:** Loop calculates each year sequentially. Could be optimized with array map.
**Impact:** Minimal (only 2-4 iterations), but code could be cleaner.
**Priority:** Low

---

### 4.4 APR Solver - Better Initial Guess
**Location:** `src/apr/aprSolver.ts:39`  
**Problem:** Default initial guess is 10% (0.1), which may be far from actual APR for low-rate loans.
**Recommendation:** Use note rate as initial guess (already implemented via `options.initialGuess`, but default should use note rate).
**Priority:** Low

---

### 4.5 Closing Costs Calculation - Memoization
**Location:** `services/loanMath.ts:326`  
**Problem:** `calculateItemCost` is called in reduce loop. If same item is calculated multiple times, could cache results.
**Impact:** Minimal (items are unique), but could help if items are duplicated.
**Priority:** Low

---

## 5. MISSING VALIDATIONS

### 5.1 Loan Amount Range Validation
**Location:** `services/loanMath.ts:85`  
**Problem:** No validation that loan amount is within reasonable bounds (e.g., $10,000 - $10,000,000).
**Recommendation:** Add validation in `calculateScenario`:
```typescript
if (baseLoanAmount < 10000 || baseLoanAmount > 10000000) {
  console.warn('Loan amount seems outside typical range');
}
```
**Priority:** Medium

---

### 5.2 Interest Rate Range Validation
**Location:** `services/loanMath.ts:89`  
**Problem:** No validation that rate is between 0% and reasonable maximum (e.g., 20%).
**Recommendation:** Already partially handled in validation.ts, but should be in calculation too.
**Priority:** Medium

---

### 5.3 Property Value Validation for Refinances
**Location:** `services/loanMath.ts:110`  
**Problem:** No validation that property value is positive and reasonable.
**Recommendation:** Add check:
```typescript
if (propertyValue <= 0) {
  throw new Error('Property value must be positive for refinance');
}
```
**Priority:** High

---

### 5.4 Payoff Amount Validation
**Location:** `services/loanMath.ts:113-115`  
**Problem:** No validation that payoff amounts are positive and less than property value.
**Recommendation:** Add validation:
```typescript
if (existingLoanPayoff < 0 || existingLoanPayoff > propertyValue * 1.1) {
  console.warn('Payoff amount seems unusual');
}
```
**Priority:** Medium

---

## 6. DOCUMENTATION GAPS

### 6.1 APR Calculation Methodology
**Location:** `src/apr/index.ts`  
**Problem:** Complex APR calculation lacks detailed comments explaining Reg Z methodology.
**Recommendation:** Add comprehensive JSDoc explaining:
- What is included/excluded from finance charges
- How payment schedule is generated
- Solver methodology
**Priority:** Medium

---

### 6.2 Refinance Cash Flow Logic
**Location:** `services/loanMath.ts:346-475`  
**Problem:** Complex refinance logic with manual vs forward calculation modes lacks clear documentation.
**Recommendation:** Add detailed comments explaining:
- When manual mode is used
- How equity is calculated
- How cash to close is determined
**Priority:** High

---

### 6.3 Buydown Calculation Assumptions
**Location:** `services/loanMath.ts:265-316`  
**Problem:** Buydown calculation assumes certain payment structures but doesn't document assumptions.
**Recommendation:** Add comments explaining:
- Buydown applies to note rate payment
- Subsidy is calculated annually
- Full payment includes all escrow items
**Priority:** Low

---

## SUMMARY OF PRIORITIES

### Immediate Action Required (Critical):
1. Fix FHA MI calculation to use baseLoanAmount (Issue 2.3)
2. Fix PMT function to handle zero rate correctly (Issue 1.2)
3. Add leap year handling for prepaid interest (Issue 1.1)
4. Fix refinance manual loan amount UFMIP logic (Issue 1.3)
5. Fix remaining balance division by zero (Issue 1.5)

### High Priority:
6. Consolidate PMT functions (Issue 2.1)
7. Improve APR solver root-finding (Issue 1.8)
8. Add property value validation (Issue 5.3)
9. Document refinance cash flow logic (Issue 6.2)

### Medium Priority:
10. Fix break-even Infinity handling (Issue 1.4)
11. Fix prepaid interest day count (Issue 2.4)
12. Fix buydown cost for short terms (Issue 2.5)
13. Add various input validations (Issues 5.1, 5.2, 5.4)
14. Fix affordability zero payment (Issue 3.13)

### Low Priority:
15. All other issues listed above

---

## TESTING RECOMMENDATIONS

### Critical Test Cases:
1. **Zero Interest Rate Loan**: $100,000, 0%, 360 months → Should show $277.78/month
2. **FHA MI Calculation**: $200,000 base, $3,500 UFMIP → MI should be $83.33/month, not $84.79
3. **Leap Year Prepaid Interest**: Closing Feb 29, 2024 → Use 366 days
4. **Refinance Manual Amount**: Enter $200,000 total → Verify base and UFMIP calculated correctly
5. **Remaining Balance Zero Rate**: 0% loan, 120 months elapsed → Should use simple subtraction

### Edge Case Test Scenarios:
- Loan amount = $1
- Interest rate = 0.01%
- Loan term = 1 month
- Property value = $0 (refinance)
- Payoff > Property value
- DTI with $0 income
- Break-even with negative savings
- Prepayment with payment < interest

---

## CONCLUSION

The codebase demonstrates solid mathematical foundations with proper use of industry-standard formulas. However, several critical issues require immediate attention, particularly around:
1. FHA MI calculation accuracy
2. Zero-interest rate handling
3. Leap year day count conventions
4. Edge case validation

Most issues are fixable with targeted changes. The architecture is sound, and the APR calculation implementation is particularly robust with proper Reg Z compliance considerations.

**Overall Assessment:** Good foundation with critical fixes needed in specific areas. Mathematical accuracy is generally high, but edge cases and some industry-specific rules need attention.

---

*End of Report*

