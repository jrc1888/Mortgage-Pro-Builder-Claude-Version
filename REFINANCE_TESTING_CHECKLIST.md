# Refinance Calculator Testing Checklist

## Part 1: Scenario Type Selection Testing

### ✅ New Scenario Creation
- [ ] Click "New Scenario" button
- [ ] Type selection modal appears first (Purchase/Refinance buttons)
- [ ] Can select "Purchase" → Click "Continue"
- [ ] Creation modal appears with borrower name and address fields
- [ ] **Transaction type toggle should NOT appear** in creation modal
- [ ] Can select "Refinance" → Click "Continue"
- [ ] Creation modal appears (same fields, no toggle)
- [ ] Create a purchase scenario → Verify it opens correctly
- [ ] Create a refinance scenario → Verify it opens correctly
- [ ] Check that `scenarioType` field is set correctly in scenario data

### ✅ Scenario Duplication
- [ ] Duplicate an existing purchase scenario
- [ ] Duplication modal appears with type selection
- [ ] Default type matches original scenario
- [ ] Can change type during duplication (Purchase → Refinance)
- [ ] Confirm duplication → Verify new scenario has correct type
- [ ] Duplicate a refinance scenario
- [ ] Verify same behavior

### ✅ Data Migration
- [ ] Load app with existing scenarios (if any)
- [ ] Check browser console for migration logs
- [ ] Verify all existing scenarios now have `scenarioType` field set
- [ ] Verify scenarios still work correctly after migration
- [ ] Open an old scenario → Verify it displays correctly
- [ ] Edit and save an old scenario → Verify `scenarioType` persists

### ✅ Conditional UI Rendering
- [ ] Open a **purchase** scenario
- [ ] Verify "Refi Analysis" tab does NOT appear in tabs
- [ ] Verify purchase-specific fields are visible (seller concessions, earnest money, etc.)
- [ ] Open a **refinance** scenario
- [ ] Verify "Refi Analysis" tab DOES appear in tabs
- [ ] Verify refinance-specific fields are visible (payoff amounts, cash out options, etc.)
- [ ] Verify purchase-specific fields are hidden (seller concessions, earnest money)

---

## Part 2: Refinance Analysis Tab Testing

### ✅ Tab Visibility & Navigation
- [ ] Open a refinance scenario
- [ ] Verify "Refi Analysis" tab appears in tab bar
- [ ] Click "Refi Analysis" tab → Tab content loads
- [ ] Verify tab styling matches other tabs (active state, hover states)
- [ ] Switch between tabs → Verify Refi Analysis tab persists
- [ ] Open a purchase scenario → Verify "Refi Analysis" tab does NOT appear

### ✅ Section 1: Current Loan Details (Input Fields)
- [ ] Navigate to Refi Analysis tab
- [ ] See "Original Loan Information" section
- [ ] Enter original loan amount: $300,000
- [ ] Enter original interest rate: 6.5%
- [ ] Select loan funding date (use date picker or manual entry)
- [ ] Select original loan term (15-year, 20-year, 30-year dropdown)
- [ ] Enter current monthly P&I payment (optional override)
- [ ] Leave current monthly payment empty → Verify auto-calculation works
- [ ] All fields use existing input component styling (currency, percentage, date inputs)
- [ ] Changes save automatically to scenario

### ✅ Section 2A: Current Loan Status (Automated Calculations)
- [ ] After entering loan details, scroll to "Current Loan Status" section
- [ ] Verify "Months Elapsed" calculates correctly from funding date
- [ ] Verify "Current Principal Balance" displays correctly
- [ ] Verify "Interest Paid to Date" displays correctly
- [ ] Verify "Principal Paid to Date" displays correctly
- [ ] Verify "Remaining Loan Term" shows years and months
- [ ] Test with different dates (recent loan vs old loan)
- [ ] Test with different terms (15-year vs 30-year)
- [ ] All currency values formatted correctly with $ and commas

### ✅ Section 2B: Payoff Calculation
- [ ] Scroll to "Payoff Calculation" section
- [ ] Verify "Current Principal Balance" matches Section 2A
- [ ] Verify "Estimated Payoff Amount" calculates correctly
- [ ] Verify "Per Diem Interest" displays correctly
- [ ] Verify per diem note shows correct date and amount
- [ ] Enter anticipated closing date (future date)
- [ ] Verify payoff amount updates with accrued interest
- [ ] Test with different closing dates → Verify days to closing calculates correctly
- [ ] Verify per diem formula: (Balance × Rate) / 365

### ✅ Section 2C: New Loan Details
- [ ] Scroll to "New Loan Details" section
- [ ] Verify "New Loan Amount" auto-populates from scenario
- [ ] Verify "New Interest Rate" auto-populates from scenario
- [ ] Verify "New Loan Term" auto-populates from scenario
- [ ] Verify "New Monthly P&I Payment" auto-populates from scenario
- [ ] Verify "Closing Costs" auto-populates from scenario
- [ ] Change new loan details in main scenario → Verify Refi Analysis updates
- [ ] All values displayed using read-only styling or summary card pattern

### ✅ Section 3: Monthly Savings Analysis
- [ ] Scroll to "Monthly Savings Analysis" section
- [ ] Verify "Current Payment" calculates correctly (or uses override)
- [ ] Verify "New Payment" matches new loan details
- [ ] Verify "Monthly Savings" calculates correctly (current - new)
- [ ] If savings is negative, verify it shows as "Monthly Increase" with red styling
- [ ] Verify "Annual Savings" = monthly savings × 12
- [ ] Test scenario where new payment is higher → Verify increase displays correctly
- [ ] Test scenario where new payment is lower → Verify savings displays correctly

### ✅ Section 3B: Break-Even Analysis
- [ ] Scroll to "Break-Even Analysis" section
- [ ] Verify "Total Refinance Costs" matches closing costs
- [ ] Verify "Monthly Savings" matches Section 3
- [ ] Verify "Break-Even Point" calculates: costs / monthly savings
- [ ] Verify break-even shows in months and years
- [ ] Verify "Break-Even Date" calculates correctly from today + break-even months
- [ ] Test with no savings (higher payment) → Verify break-even shows "Never" or appropriate message
- [ ] Test with very low costs → Verify break-even is very short
- [ ] Test with high costs → Verify break-even is longer

### ✅ Section 3C: Total Interest Comparison
- [ ] Scroll to "Interest Over Life of Loan" section
- [ ] Verify "Remaining Interest (Current)" calculates correctly
- [ ] Verify "Total Interest (New Loan)" calculates correctly
- [ ] Verify "Net Interest Savings" = remaining - new total
- [ ] If negative, verify it shows as "Net Interest Cost" with appropriate styling
- [ ] Verify note about closing costs appears
- [ ] Test with rate reduction → Verify shows savings
- [ ] Test with rate increase → Verify shows cost

### ✅ Section 4: 15-Year vs 30-Year Comparison
- [ ] Scroll to "15-Year vs 30-Year Comparison" section
- [ ] Verify comparison table displays correctly
- [ ] Verify 30-year interest rate matches scenario rate
- [ ] Verify 15-year interest rate is 0.375% lower (typical market difference)
- [ ] Verify monthly payments calculate correctly for both terms
- [ ] Verify total interest calculates correctly for both terms
- [ ] Verify payoff dates calculate correctly
- [ ] Verify "Years Saved" shows 15 years
- [ ] Verify "Interest Saved" = 30-year interest - 15-year interest
- [ ] Verify "Monthly Difference" shows additional payment required for 15-year
- [ ] Table uses existing table/card styling pattern
- [ ] Highlight/callout styling for key metrics

### ✅ Section 5: Prepayment Strategy Advisor
- [ ] Scroll to "Prepayment Strategy Advisor" section
- [ ] Verify "15-Year Required Payment" displays correctly
- [ ] Verify "30-Year Base Payment" displays correctly
- [ ] Verify "Difference" = 15-year payment - 30-year payment
- [ ] Review "30-Year + Extra Payment Match" section:
  - [ ] Verify pays off in ~15 years
  - [ ] Verify total interest calculates correctly
  - [ ] Verify interest saved vs straight 30-year
  - [ ] Verify flexibility benefit note
- [ ] Review "30-Year + Half the Difference" section:
  - [ ] Verify extra payment = difference / 2
  - [ ] Verify payoff time calculates correctly
  - [ ] Verify interest saved calculates correctly
- [ ] Review "Key Advantage" callout:
  - [ ] Verify text explains flexibility benefit
  - [ ] Verify mentions lower required payment
- [ ] Review "Risk Consideration" warning:
  - [ ] Verify mentions discipline requirement
  - [ ] Verify shows full 30-year interest if no extra payments
- [ ] Test "Calculate Custom Extra Payment Scenario":
  - [ ] Enter custom extra payment amount (e.g., $300)
  - [ ] Verify payoff time calculates
  - [ ] Verify total interest calculates
  - [ ] Verify interest saved calculates
  - [ ] Try different amounts (0, small, large)
- [ ] All calculations use existing card/comparison layout

### ✅ Section 6: PDF Export
- [ ] Scroll to "Refinance Analysis Report" section
- [ ] Click "Download Refinance Analysis" button
- [ ] Verify button shows loading state while generating
- [ ] PDF preview modal opens (using existing Modal component)
- [ ] Verify PDF displays correctly in preview
- [ ] Verify PDF includes:
  - [ ] Branded header (Guild Mortgage logo and officer info)
  - [ ] Client information section
  - [ ] Executive Summary (all key metrics)
  - [ ] Current Loan Status section
  - [ ] Payoff Calculation section
  - [ ] New Loan Details section
  - [ ] Monthly Savings & Break-Even section
  - [ ] Total Interest Comparison section
  - [ ] 15 vs 30 Year Comparison table
  - [ ] Prepayment Strategy Analysis section
  - [ ] Footer with officer contact info and disclaimer
- [ ] Click "Download PDF" in modal → PDF downloads
- [ ] Verify filename format: "[LastName] - Refinance Analysis.pdf"
- [ ] Open downloaded PDF → Verify all sections render correctly
- [ ] Verify PDF styling matches pre-approval letter quality
- [ ] Close modal → Verify cleanup (no memory leaks)
- [ ] Test with incomplete data → Verify appropriate error handling

---

## Calculation Accuracy Testing

### ✅ Test Scenario 1: Standard Rate & Term Refinance
**Setup:**
- Original: $300,000 at 7.0%, 30-year, funded 3 years ago
- New: $300,000 at 6.5%, 30-year, $5,000 closing costs

**Verify:**
- [ ] Current balance ≈ $285,000-290,000
- [ ] Monthly savings ≈ $85-100/month
- [ ] Break-even ≈ 50-60 months
- [ ] Interest savings calculated correctly

### ✅ Test Scenario 2: 15-Year Option
**Setup:**
- Original: $300,000 at 7.0%, 30-year
- New Option 1: $300,000 at 6.5%, 30-year
- New Option 2: $300,000 at 6.125%, 15-year

**Verify:**
- [ ] 15-year payment is significantly higher
- [ ] 15-year interest savings is substantial
- [ ] Prepayment scenarios calculate correctly
- [ ] Flexibility analysis shows correct difference

### ✅ Test Scenario 3: Negative Savings (Rate Increase)
**Setup:**
- Original: $300,000 at 6.0%, 30-year
- New: $300,000 at 6.5%, 30-year

**Verify:**
- [ ] Shows "Monthly Increase" with red styling
- [ ] Break-even shows "Never" or appropriate message
- [ ] Interest comparison shows cost, not savings

### ✅ Test Scenario 4: Cash-Out Refinance
**Setup:**
- Original: $300,000 at 7.0%, 30-year, current balance $250,000
- New: $320,000 at 6.5%, 30-year (cash out $70,000)

**Verify:**
- [ ] Current balance reflects remaining balance
- [ ] New loan amount shows $320,000
- [ ] Calculations account for higher new loan amount

---

## Edge Cases & Error Handling

### ✅ Edge Cases
- [ ] Empty current loan data → Appropriate message or placeholder
- [ ] Very old loan (30+ years) → Handles gracefully
- [ ] Very recent loan (days old) → Calculations work
- [ ] Zero interest rate → Handles division by zero
- [ ] Very high interest rate → Calculations still work
- [ ] Negative closing costs (credits exceed costs) → Handles correctly
- [ ] Very large loan amounts → Formatting works correctly
- [ ] Missing funding date → Appropriate fallback

### ✅ Error Handling
- [ ] Invalid date entry → Error message or fallback
- [ ] Missing required fields → Appropriate validation
- [ ] PDF generation fails → Error toast/message
- [ ] Calculation errors → Graceful degradation

---

## UI/UX Consistency Testing

### ✅ Design System Consistency
- [ ] All inputs use existing input component styles
- [ ] All cards/sections use existing card styling
- [ ] All buttons use existing button components
- [ ] All colors match Guild Mortgage branding
- [ ] All typography matches existing patterns
- [ ] All spacing/padding matches existing layouts
- [ ] Mobile responsive (test on small screen)
- [ ] Tablet responsive (test on medium screen)

### ✅ User Experience
- [ ] Tab loads quickly
- [ ] Calculations update in real-time as inputs change
- [ ] No layout shifts or jumping
- [ ] Tooltips/info icons explain complex concepts
- [ ] Error messages are clear and actionable
- [ ] Loading states for async operations (PDF generation)
- [ ] Smooth transitions and animations
- [ ] Keyboard navigation works correctly
- [ ] Screen reader friendly (if applicable)

---

## Integration Testing

### ✅ Scenario Integration
- [ ] Create new refinance scenario → Refi Analysis tab appears
- [ ] Change new loan details in main scenario → Refi Analysis updates
- [ ] Change closing costs in Costs tab → Break-even recalculates
- [ ] Save scenario → Refi Analysis data persists
- [ ] Reload page → Refi Analysis data still there
- [ ] Switch between purchase and refinance scenarios → Tabs show/hide correctly

### ✅ Data Persistence
- [ ] Enter current loan details → Save scenario
- [ ] Close and reopen scenario → Current loan details persist
- [ ] Duplicate scenario → Current loan details copy correctly
- [ ] Migration preserves existing data correctly

---

## Performance Testing

### ✅ Performance
- [ ] Tab loads without lag
- [ ] Calculations complete quickly (< 100ms)
- [ ] PDF generation completes in reasonable time (< 5 seconds)
- [ ] No memory leaks (check with browser dev tools)
- [ ] Large datasets don't cause performance issues

---

## Final Verification

### ✅ Complete Workflow Test
1. [ ] Create new refinance scenario
2. [ ] Fill in all loan details
3. [ ] Navigate to Refi Analysis tab
4. [ ] Enter current loan information
5. [ ] Review all calculated sections
6. [ ] Adjust new loan details in main scenario
7. [ ] Verify Refi Analysis recalculates
8. [ ] Generate PDF report
9. [ ] Download and verify PDF
10. [ ] Save scenario
11. [ ] Close and reopen scenario
12. [ ] Verify all data persists

---

## Notes

- All tests should be performed in both desktop and mobile views
- Test with different browsers (Chrome, Firefox, Safari, Edge)
- Verify calculations match industry-standard mortgage calculators
- Cross-reference with actual loan documentation when possible

---

**Last Updated:** $(date)
**Status:** ✅ Ready for Testing

