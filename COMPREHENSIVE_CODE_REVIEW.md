# Comprehensive Code Review: Mortgage Pro Builder
## Triple-Expert Analysis: Mortgage Engineering | REG Z/TILA Compliance | UX Design

**Review Date:** 2024  
**Reviewers:** Senior Mortgage Software Engineer (15+ years), REG Z/TILA Compliance Specialist, UX Specialist

---

## EXECUTIVE SUMMARY

This codebase demonstrates strong technical architecture with a sophisticated APR calculation module and comprehensive loan scenario modeling. However, there are **critical compliance gaps**, **calculation accuracy concerns**, and **UX friction points** that require immediate attention.

**Overall Assessment:**
- ✅ **Strengths:** Well-structured APR module, comprehensive loan types, good validation framework
- ⚠️ **Critical Issues:** Missing REG Z disclosures, MI calculation accuracy, cash-to-close transparency
- 🔧 **Improvements Needed:** UX clarity, edge case handling, compliance language

---

## 🔴 CRITICAL ISSUES (Compliance Risks & Calculation Errors)

### 1. **MISSING REG Z/TILA REQUIRED DISCLOSURES** 
**Expert:** REG Z/TILA Compliance Specialist  
**Severity:** CRITICAL - Regulatory Violation Risk

**Issue:** The application calculates APR but does not display required TILA disclosures:
- No "Amount Financed" disclosure
- No "Finance Charge" disclosure  
- No "Total of Payments" disclosure
- No APR explanation/disclaimer

**Location:** `components/ScenarioBuilder.tsx`, `services/preApprovalPDF.ts`

**Regulatory Requirement:** Reg Z §1026.18 requires these disclosures on all closed-end credit transactions.

**Impact:** 
- Legal compliance risk
- Borrower confusion about true cost of credit
- Potential CFPB violations

**Recommendation:**
```typescript
// Add to CalculatedResults interface
interface CalculatedResults {
  // ... existing fields
  regZDisclosures: {
    amountFinanced: number;      // Base loan - finance charges
    financeCharge: number;        // Total finance charges
    totalOfPayments: number;      // Sum of all payments
    apr: number;                  // Already calculated
  };
}

// Display in UI with required language:
// "The cost of your credit as a yearly rate: X.XX%"
// "Amount Financed: $XXX,XXX"
// "Finance Charge: $X,XXX"
// "Total of Payments: $XXX,XXX"
```

---

### 2. **MORTGAGE INSURANCE CALCULATION ACCURACY CONCERNS**
**Expert:** Senior Mortgage Software Engineer  
**Severity:** CRITICAL - Calculation Error Risk

**Issue:** Conventional MI calculation uses simplified tiered rates that may not match actual MI provider calculations.

**Location:** `services/loanMath.ts:152-162`

**Current Implementation:**
```typescript
if (ltv > 95) factor = 0.0095;      // 0.95% annual
else if (ltv > 90) factor = 0.0075; // 0.75% annual
else if (ltv > 85) factor = 0.0048; // 0.48% annual
else factor = 0.0028;               // 0.28% annual
```

**Problems:**
1. **No credit score consideration** - Real MI rates vary significantly by credit score
2. **No loan amount tiers** - MI rates often have loan amount breakpoints
3. **No coverage level adjustment** - Different coverage levels (12%, 25%, 30%) have different rates
4. **FHA MI rate may be outdated** - 0.55% for LTV > 95% and 0.50% for LTV ≤ 95% are correct, but should verify current HUD rates

**Impact:**
- Borrowers may see incorrect monthly payments
- Qualification calculations may be wrong
- Cash-to-close may be inaccurate

**Recommendation:**
```typescript
// Add credit score and loan amount to MI calculation
interface MICalculationParams {
  ltv: number;
  creditScore: number;
  loanAmount: number;
  loanType: LoanType;
  coverageLevel?: number; // 12, 25, 30
}

// Use actual MI rate tables or API integration
// For now, add warnings when using simplified rates:
if (scenario.loanType === LoanType.CONVENTIONAL) {
  console.warn('Using simplified MI rates. Actual rates may vary by credit score and loan amount.');
}
```

---

### 3. **CASH-TO-CLOSE BREAKDOWN LACKS TRANSPARENCY**
**Expert:** UX Specialist + REG Z Compliance  
**Severity:** CRITICAL - Borrower Confusion & Compliance Risk

**Issue:** Cash-to-close calculation is correct but the breakdown is not clearly displayed to users.

**Location:** `components/ScenarioBuilder.tsx:2234-2297`

**Current Display:**
- Shows final "Cash to Close" amount
- Does not show line-by-line breakdown
- Does not clearly separate prepaids vs. closing costs
- Does not show DPA impact clearly

**REG Z Requirement:** Borrowers must understand what they're paying for. The Loan Estimate format (A-I sections) helps, but cash-to-close needs explicit breakdown.

**Recommendation:**
```typescript
// Add detailed cash-to-close breakdown component
interface CashToCloseBreakdown {
  downPayment: number;
  closingCosts: {
    loanCosts: number;      // Sections A+B+C
    otherCosts: number;    // Sections E+F+G+H
    prepaids: number;      // Section F (prepaid interest, insurance, taxes)
    escrows: number;       // Section G
  };
  credits: {
    sellerConcessions: number;
    lenderCredits: number;
  };
  dpaAssistance: number;
  earnestMoney: number;
  netCashToClose: number;
}
```

**UX Improvement:** Add expandable "Cash to Close Details" section with clear line items.

---

### 4. **PRE-APPROVAL LETTER MISSING COMPLIANCE LANGUAGE**
**Expert:** REG Z/TILA Compliance Specialist  
**Severity:** CRITICAL - Legal Risk

**Issue:** Pre-approval letter lacks required disclaimers and may create binding commitments unintentionally.

**Location:** `services/preApprovalPDF.ts:240-246`

**Current Language:**
```
"This pre-approval is based on current market conditions..."
```

**Missing:**
- "This is not a commitment to lend"
- "Subject to satisfactory appraisal, title, and final underwriting approval"
- "Rate is floating and subject to change until locked"
- Fair lending disclaimer
- Equal housing opportunity statement

**Recommendation:**
```typescript
const COMPLIANCE_DISCLAIMERS = `
This pre-approval is not a commitment to lend. All information is subject to verification and 
final underwriting approval. Rate is floating and subject to change until locked. This letter 
is typically valid for 60 days from the date shown above, subject to satisfactory appraisal, 
title, and final underwriting approval.

Equal Housing Opportunity Lender. We do business in accordance with the Federal Fair Housing 
Act and Equal Credit Opportunity Act.
`;
```

---

### 5. **APR CALCULATION: FINANCED FEES DOUBLE-COUNTING RISK**
**Expert:** Senior Mortgage Software Engineer + REG Z Compliance  
**Severity:** HIGH - Calculation Accuracy

**Issue:** The APR calculation correctly handles financed upfront fees (UFMIP, VA funding fee), but there's a potential edge case where fees could be misclassified.

**Location:** `src/apr/adapter.ts:64-120`

**Concern:** When converting closing costs to fee format, all fees default to `paid_by: 'borrower_cash'`. If a fee is actually financed (rare but possible), it should adjust the note balance.

**Current Code:**
```typescript
return {
  name: item.name,
  amount: cost,
  paid_to: paidTo,
  paid_by: 'borrower_cash' as const, // Default - could be enhanced
  // ...
};
```

**Impact:** If a fee is financed but marked as cash-paid, APR will be slightly incorrect.

**Recommendation:**
- Add UI option to mark fees as "financed" vs "cash-paid"
- Or add validation to ensure financed fees are properly identified
- Document that currently all fees are assumed cash-paid (which is standard)

---

## ⚠️ IMPORTANT IMPROVEMENTS (UX Friction & Missing Features)

### 6. **INFORMATION HIERARCHY: KEY NUMBERS NOT PROMINENT ENOUGH**
**Expert:** UX Specialist  
**Severity:** IMPORTANT - User Confusion

**Issue:** The most important numbers (monthly payment, cash-to-close, APR) are displayed but not given visual prominence that matches their importance.

**Location:** `components/ScenarioBuilder.tsx:2151-2174`

**Current:** LTV, Rate, and APR are shown in a compact card, but monthly payment and cash-to-close are in separate sections.

**Recommendation:**
- Create a "Key Numbers" hero section at top with:
  - **Monthly Payment** (largest, most prominent)
  - **Cash to Close** (second largest)
  - **APR** (prominent, with explanation tooltip)
  - Rate, LTV, DTI (secondary)

---

### 7. **APR EXPLANATION MISSING FOR BORROWERS**
**Expert:** UX Specialist + REG Z Compliance  
**Severity:** IMPORTANT - Borrower Education

**Issue:** APR is displayed but not explained. Many borrowers don't understand what APR means.

**Location:** `components/ScenarioBuilder.tsx:2167-2174`

**Current:** Shows APR percentage only.

**Recommendation:**
```tsx
<div className="relative group">
  <span>APR: {formatPercent(apr, 3)}</span>
  <Info className="inline ml-1 text-slate-400" />
  <Tooltip>
    APR (Annual Percentage Rate) is the total cost of your loan expressed as a yearly rate. 
    It includes your interest rate plus finance charges like points and origination fees. 
    Use APR to compare loan offers from different lenders.
  </Tooltip>
</div>
```

---

### 8. **EDGE CASE: ZERO DOWN PAYMENT LOANS**
**Expert:** Senior Mortgage Software Engineer  
**Severity:** IMPORTANT - Edge Case Handling

**Issue:** VA loans allow 0% down, but the UI may not handle this gracefully.

**Location:** `services/loanMath.ts:100`, `services/validation.ts:130`

**Current:** Validation allows 0% down for VA, but UI might show confusing "0% down" or "$0 down".

**Recommendation:**
- Add special handling for VA loans:
  ```typescript
  const downPaymentDisplay = scenario.loanType === LoanType.VA && downPaymentAmount === 0
    ? "No Down Payment Required (VA)"
    : formatPercent(scenario.downPaymentPercent, 1);
  ```

---

### 9. **DTI VALIDATION THRESHOLDS MAY BE TOO RESTRICTIVE**
**Expert:** Senior Mortgage Software Engineer  
**Severity:** IMPORTANT - Qualification Accuracy

**Issue:** Hard-coded DTI thresholds (46.99% front-end, 49.99% back-end conventional) may not reflect actual lender guidelines.

**Location:** `services/loanMath.ts:417-422`, `services/validation.ts:70-78`

**Current:**
```typescript
const convAffordability = calculateAffordability(46.99, 49.99);
const fhaAffordability = calculateAffordability(46.99, 57.00);
```

**Problems:**
- Conventional loans can go up to 50% DTI with compensating factors
- Some programs allow higher DTIs
- These should be configurable per lender/program

**Recommendation:**
- Make DTI thresholds configurable in settings
- Add "compensating factors" toggle to allow higher DTIs
- Show warnings instead of errors for DTI > 43%

---

### 10. **MOBILE RESPONSIVENESS: COMPLEX FORMS ON SMALL SCREENS**
**Expert:** UX Specialist  
**Severity:** IMPORTANT - Mobile Usability

**Issue:** The scenario builder has many input fields that may be difficult to use on mobile devices.

**Location:** `components/ScenarioBuilder.tsx` (entire component)

**Recommendation:**
- Add mobile-specific layouts
- Use accordion/collapsible sections for advanced options
- Consider a "mobile view" that shows only essential fields first
- Test on actual devices (not just browser dev tools)

---

### 11. **ERROR MESSAGING: NOT USER-FRIENDLY**
**Expert:** UX Specialist  
**Severity:** IMPORTANT - User Experience

**Issue:** Validation errors use technical language that may confuse borrowers.

**Location:** `services/validation.ts:80-213`

**Example:**
```
"LTV (96.5%) exceeds maximum 96.5% for FHA"
```

**Recommendation:**
- Use borrower-friendly language:
  ```
  "Your down payment is too low for an FHA loan. 
   FHA requires at least 3.5% down payment."
  ```
- Add "Why?" tooltips explaining the rule
- Provide actionable next steps

---

### 12. **MISSING: TOTAL OF PAYMENTS DISCLOSURE**
**Expert:** REG Z Compliance  
**Severity:** IMPORTANT - Compliance Gap

**Issue:** While APR is calculated, "Total of Payments" (sum of all payments over loan life) is not displayed.

**Location:** Missing entirely

**REG Z Requirement:** Must show total amount borrower will pay over life of loan.

**Recommendation:**
```typescript
// Add to CalculatedResults
totalOfPayments: number; // Sum of all monthly payments + down payment

// Calculate:
const totalOfPayments = 
  (results.monthlyPrincipalAndInterest * scenario.loanTermMonths) +
  results.downPaymentRequired +
  (results.monthlyMI * scenario.loanTermMonths); // Approximate MI over life

// Display with disclaimer:
"Total of Payments: $XXX,XXX (This is the total amount you will have paid after making all 
 scheduled payments. This amount includes your $XX,XXX down payment.)"
```

---

## 🔵 ENHANCEMENT OPPORTUNITIES (Nice-to-Haves)

### 13. **BUYDOWN COST CALCULATION: SIMPLIFIED ASSUMPTION**
**Expert:** Senior Mortgage Software Engineer  
**Severity:** LOW - Enhancement

**Issue:** Buydown cost calculation assumes lender pays the subsidy upfront. In reality, buydowns can be structured differently (seller-paid, lender-paid, split).

**Location:** `services/loanMath.ts:198-249`

**Recommendation:**
- Add "Buydown Paid By" option (Lender, Seller, Split)
- Adjust cash-to-close calculation accordingly
- Update APR if seller-paid (may affect finance charges)

---

### 14. **INTEREST-ONLY LOANS: BALLOON PAYMENT WARNING**
**Expert:** UX Specialist  
**Severity:** LOW - User Education

**Issue:** Interest-only loans show the IO payment but don't prominently warn about the balloon payment at the end of the IO period.

**Location:** `services/loanMath.ts:121-136`

**Recommendation:**
- Add prominent warning banner:
  ```
  ⚠️ Interest-Only Period: Your payment of $X,XXX/month is interest-only for 
  the first 10 years. After that, your payment will increase to approximately 
  $X,XXX/month (principal + interest) for the remaining 20 years.
  ```
- Show payment schedule comparison (IO period vs. amortizing period)

---

### 15. **PREPAID INTEREST: DAY COUNT METHOD**
**Expert:** Senior Mortgage Software Engineer  
**Severity:** LOW - Precision

**Issue:** Prepaid interest uses 365-day year. Some lenders use 360-day year (banker's year).

**Location:** `services/loanMath.ts:62`

**Current:**
```typescript
const dailyInterest = (loanAmount * (annualInterestRate / 100)) / 365;
```

**Recommendation:**
- Add setting for day count method (365 vs 360)
- Default to 365 (more common for mortgages)
- Document the choice

---

### 16. **ARM LOANS: INDEX ASSUMPTIONS NOT CLEAR**
**Expert:** Senior Mortgage Software Engineer  
**Severity:** LOW - Transparency

**Issue:** ARM calculations use "constant index" assumption, but this isn't clearly communicated to users.

**Location:** `src/apr/paymentSchedule.ts:162-163`

**Recommendation:**
- Add disclaimer:
  ```
  "ARM payment projections assume the index rate remains constant at [X]%. 
   Actual payments will vary based on index movements."
  ```
- Consider adding "stress test" showing payments at max rate

---

### 17. **WHITE-LABEL BRANDING: INCONSISTENT APPLICATION**
**Expert:** UX Specialist  
**Severity:** LOW - Brand Consistency

**Issue:** Branding configuration exists but may not be applied consistently across all PDFs and UI elements.

**Location:** `config/branding.ts`, `services/preApprovalPDF.ts`

**Recommendation:**
- Audit all PDFs and UI components for consistent branding
- Ensure logo appears in all outputs
- Verify color scheme is applied everywhere

---

### 18. **SCENARIO COMPARISON: MISSING APR COMPARISON**
**Expert:** UX Specialist  
**Severity:** LOW - Feature Enhancement

**Issue:** Scenario comparison shows rates but APR comparison could be more prominent.

**Location:** `components/ScenarioComparison.tsx:137`

**Recommendation:**
- Add APR column with visual comparison (bars/chart)
- Highlight which scenario has better APR
- Add tooltip explaining APR difference

---

## 📊 PRIORITY MATRIX

| Priority | Issue | Expert Perspective | Effort | Impact |
|----------|-------|-------------------|--------|--------|
| P0 | Missing REG Z Disclosures | Compliance | Medium | Critical |
| P0 | MI Calculation Accuracy | Engineering | High | Critical |
| P0 | Cash-to-Close Transparency | UX + Compliance | Medium | Critical |
| P0 | Pre-Approval Compliance Language | Compliance | Low | Critical |
| P1 | APR Double-Counting Risk | Engineering + Compliance | Medium | High |
| P1 | Information Hierarchy | UX | Medium | High |
| P1 | APR Explanation | UX + Compliance | Low | High |
| P1 | Zero Down Payment Handling | Engineering | Low | Medium |
| P1 | DTI Thresholds | Engineering | Medium | Medium |
| P2 | Mobile Responsiveness | UX | High | Medium |
| P2 | Error Messaging | UX | Low | Medium |
| P2 | Total of Payments | Compliance | Low | Medium |
| P3 | Buydown Cost Structure | Engineering | Medium | Low |
| P3 | IO Balloon Warning | UX | Low | Low |
| P3 | Day Count Method | Engineering | Low | Low |

---

## 🎯 RECOMMENDED ACTION PLAN

### Phase 1: Critical Compliance (Week 1-2)
1. Add REG Z required disclosures (Amount Financed, Finance Charge, Total of Payments)
2. Add compliance language to pre-approval letter
3. Add APR explanation tooltip
4. Improve cash-to-close breakdown display

### Phase 2: Calculation Accuracy (Week 3-4)
1. Enhance MI calculation with credit score consideration
2. Add validation for financed fees in APR calculation
3. Add edge case handling for zero down payment
4. Make DTI thresholds configurable

### Phase 3: UX Improvements (Week 5-6)
1. Redesign information hierarchy (key numbers prominence)
2. Improve error messaging (borrower-friendly language)
3. Add mobile-responsive layouts
4. Add payment schedule visualization for IO loans

### Phase 4: Enhancements (Ongoing)
1. Buydown structure options
2. ARM stress testing
3. Scenario comparison enhancements
4. Branding consistency audit

---

## 📝 ADDITIONAL OBSERVATIONS

### Strengths
- ✅ Excellent APR calculation module with proper Reg Z methodology
- ✅ Comprehensive loan type support (Conventional, FHA, VA, Jumbo)
- ✅ Good validation framework
- ✅ Clean code architecture
- ✅ Proper handling of financed upfront fees (UFMIP, VA funding fee)

### Code Quality
- Well-structured TypeScript
- Good separation of concerns
- Comprehensive type definitions
- Proper error handling in most places

### Areas for Code Improvement
- Some magic numbers could be constants (DTI thresholds, MI rates)
- Consider extracting MI calculation to separate service
- Add unit tests for edge cases (zero down, high DTI, etc.)

---

## 🔍 SPECIFIC CODE REVIEW FINDINGS

### Mortgage Insurance Calculation (`services/loanMath.ts:138-163`)

**Current Implementation:**
```typescript
if (scenario.loanType === LoanType.FHA) {
  const factor = ltv > 95 ? 0.0055 : 0.0050; 
  miRatePercent = factor * 100;
  monthlyMI = (totalLoanAmount * factor) / 12;
} else if (scenario.loanType === LoanType.CONVENTIONAL && ltv > 80) {
  let factor = 0;
  if (ltv > 95) factor = 0.0095;
  else if (ltv > 90) factor = 0.0075;
  else if (ltv > 85) factor = 0.0048;
  else factor = 0.0028;
  miRatePercent = factor * 100;
  monthlyMI = (totalLoanAmount * factor) / 12;
}
```

**Issues:**
1. No credit score consideration (critical for conventional MI)
2. No loan amount tiers
3. Rates may be outdated
4. No coverage level adjustment

**Recommendation:** Integrate with MI provider API or use comprehensive rate tables.

---

### APR Calculation (`src/apr/index.ts`)

**Strengths:**
- Proper Reg Z methodology
- Correct handling of financed fees
- Good fee classification logic
- Proper present value calculation

**Concerns:**
- Fee classification defaults all fees to "borrower_cash" - may miss financed fees
- No validation that APR >= interest rate when finance charges exist (only console.warn)

**Recommendation:**
- Add explicit validation and error if APR < interest rate with finance charges
- Consider adding "paid_by" option in UI for closing costs

---

### Cash-to-Close Calculation (`services/loanMath.ts:315-327`)

**Current:**
```typescript
const totalFundsRequired = downPaymentAmount + netClosingCosts - totalDPAAmount;
const cashToClose = totalFundsRequired - earnestMoney;
```

**Correctness:** ✅ Calculation is mathematically correct

**Transparency:** ❌ Breakdown not clearly displayed

**Recommendation:** Add detailed breakdown component showing each line item.

---

## ✅ CONCLUSION

This is a **well-architected mortgage calculator** with strong technical foundations. The APR calculation module is particularly impressive in its Reg Z compliance. However, **critical compliance gaps** must be addressed immediately to avoid regulatory risk, and **calculation accuracy improvements** are needed for production use.

**Overall Grade: B+**
- Technical Architecture: A
- Compliance: C+ (needs REG Z disclosures)
- UX: B (good but needs hierarchy improvements)
- Calculation Accuracy: B+ (good but MI needs work)

**Recommendation:** Address P0 issues before production deployment, especially REG Z disclosures and MI calculation accuracy.

---

**Review Completed:** 2024  
**Next Review:** After Phase 1 implementation

