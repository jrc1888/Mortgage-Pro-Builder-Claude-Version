/**
 * Manual test cases for refinance calculations
 * Run these manually to verify calculations are correct
 */

import {
  calculateRemainingBalance,
  calculateTotalInterestPaid,
  calculateCurrentLoanStatus,
  calculatePayoff,
  calculateBreakEven,
  calculateTotalInterest,
  calculateTermComparison,
  calculatePrepaymentScenario
} from '../refinanceCalculations';

// Test Case 1: Remaining Balance Calculation
console.log('=== Test 1: Remaining Balance ===');
const balance = calculateRemainingBalance(300000, 6.5, 360, 60); // $300k, 6.5%, 30-year, 60 months elapsed
console.log(`Original: $300,000 | Rate: 6.5% | Term: 30 years | Months Elapsed: 60`);
console.log(`Remaining Balance: $${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`Expected: ~$275,000-$280,000`);
console.log('');

// Test Case 2: Total Interest Paid
console.log('=== Test 2: Total Interest Paid ===');
const interestPaid = calculateTotalInterestPaid(300000, 6.5, 360, 60);
console.log(`Interest Paid after 60 months: $${interestPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log('');

// Test Case 3: Current Loan Status
console.log('=== Test 3: Current Loan Status ===');
const testLoan = {
  originalAmount: 300000,
  originalRate: 6.5,
  fundingDate: new Date('2020-01-01').toISOString(),
  originalTerm: 360,
  currentMonthlyPayment: undefined
};
const status = calculateCurrentLoanStatus(testLoan);
if (status) {
  console.log(`Months Elapsed: ${status.monthsElapsed}`);
  console.log(`Current Balance: $${status.currentPrincipalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Interest Paid: $${status.totalInterestPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Remaining Term: ${Math.floor(status.remainingTermYears)} years, ${status.remainingTermMonths % 12} months`);
}
console.log('');

// Test Case 4: Payoff Calculation
console.log('=== Test 4: Payoff Calculation ===');
if (status) {
  const payoff = calculatePayoff(status.currentPrincipalBalance, 6.5, new Date('2025-03-15').toISOString());
  console.log(`Current Balance: $${payoff.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Per Diem: $${payoff.perDiemInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Days to Closing: ${payoff.daysToClosing}`);
  console.log(`Payoff Amount: $${payoff.payoffAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}
console.log('');

// Test Case 5: Break-Even Analysis
console.log('=== Test 5: Break-Even Analysis ===');
const breakEven = calculateBreakEven(5000, 200); // $5,000 costs, $200/month savings
if (breakEven) {
  console.log(`Total Costs: $${breakEven.totalCosts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Monthly Savings: $${breakEven.monthlySavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Break-Even: ${breakEven.breakEvenMonths} months (${breakEven.breakEvenYears.toFixed(1)} years)`);
}
console.log('');

// Test Case 6: Term Comparison
console.log('=== Test 6: 15 vs 30 Year Comparison ===');
const term30 = calculateTermComparison(300000, 6.5, 360);
const term15 = calculateTermComparison(300000, 6.125, 180); // 0.375% lower rate for 15-year
console.log('30-Year:');
console.log(`  Monthly Payment: $${term30.monthlyPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Total Interest: $${term30.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log('15-Year:');
console.log(`  Monthly Payment: $${term15.monthlyPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Total Interest: $${term15.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Interest Saved: $${(term30.totalInterest - term15.totalInterest).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log('');

// Test Case 7: Prepayment Scenario
console.log('=== Test 7: Prepayment Scenario ===');
const prepayment = calculatePrepaymentScenario(300000, 6.5, 360, 500); // $300k, 6.5%, 30-year, $500 extra/month
console.log(`Base Payment: $${prepayment.basePayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`Extra Payment: $${prepayment.extraPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month`);
console.log(`Payoff Time: ${prepayment.payoffYears.toFixed(1)} years`);
console.log(`Interest Saved: $${prepayment.interestSaved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log('');

console.log('=== All Tests Complete ===');
console.log('Review the calculations above to verify they are mathematically correct.');


