/**
 * Helper functions for refinance calculations
 */

import { LoanType } from '../types';

/**
 * Get maximum LTV for refinance based on loan type and refinance type
 * 
 * Note: For FHA loans, UFMIP can be financed and added on top of the base loan.
 * The BASE loan amount must be within the LTV limit, but the TOTAL loan amount
 * (base + UFMIP) can exceed the LTV limit.
 * 
 * @param loanType - Type of loan
 * @param refinanceType - Type of refinance (rate_and_term or cash_out)
 * @param creditScore - Borrower credit score (affects some LTV limits)
 * @returns Maximum LTV percentage (e.g., 80 for 80%)
 */
export function getMaxLTVForRefinance(
  loanType: LoanType,
  refinanceType: 'rate_and_term' | 'cash_out',
  creditScore: number = 740
): number {
  if (loanType === LoanType.CONVENTIONAL) {
    if (refinanceType === 'cash_out') {
      // Cash-out: typically 80% max, can go higher with MI (up to 90-95%)
      // For now, use 80% as standard, can be enhanced later
      return creditScore >= 740 ? 80 : 75;
    } else {
      // Rate and term: up to 97% with MI
      return 97;
    }
  }
  
  if (loanType === LoanType.FHA) {
    if (refinanceType === 'cash_out') {
      // FHA cash-out: 80% max (base loan, UFMIP can be added on top)
      return 80;
    } else {
      // FHA rate and term: 96.5% standard (base loan, UFMIP can be added on top)
      // Note: Streamline refis can go to 97.75%, but we'll use 96.5% as standard
      return 96.5;
    }
  }
  
  if (loanType === LoanType.VA) {
    // VA: up to 100% for both types (if sufficient equity)
    // VA funding fee can be financed on top
    return 100;
  }
  
  if (loanType === LoanType.JUMBO) {
    // Jumbo: typically 80% for cash-out, 85-90% for rate/term
    return refinanceType === 'cash_out' ? 80 : 85;
  }
  
  // Default fallback
  return 80;
}

/**
 * Calculate maximum cash out available for cash-out refinance
 * 
 * @param propertyValue - Appraised property value
 * @param maxLTV - Maximum LTV percentage
 * @param existingLoanPayoff - First mortgage payoff
 * @param secondMortgagePayoff - Second mortgage payoff (if applicable)
 * @param closingCosts - Total closing costs
 * @param financeClosingCosts - Whether closing costs are financed
 * @param ufmipAmount - UFMIP or VA funding fee amount (if applicable)
 * @returns Maximum cash out available
 */
export function calculateMaxCashOut(
  propertyValue: number,
  maxLTV: number,
  existingLoanPayoff: number,
  secondMortgagePayoff: number,
  closingCosts: number,
  financeClosingCosts: boolean,
  ufmipAmount: number = 0
): number {
  // Maximum base loan amount (before UFMIP)
  const maxBaseLoan = propertyValue * (maxLTV / 100);
  
  // Total payoff needed
  const totalPayoff = existingLoanPayoff + secondMortgagePayoff;
  
  // Closing costs that will be financed
  const financedCosts = financeClosingCosts ? closingCosts : 0;
  
  // Maximum cash out = max base loan - payoff - financed closing costs
  // Note: UFMIP is added on top of base loan, so it doesn't reduce available cash out
  const maxCashOut = maxBaseLoan - totalPayoff - financedCosts;
  
  return Math.max(0, maxCashOut);
}

/**
 * Adjust interest rate for cash-out refinance
 * Cash-out refis typically have 0.25-0.50% higher rates
 * 
 * @param baseRate - Base interest rate
 * @param refinanceType - Type of refinance
 * @param customAdjustment - User-specified rate adjustment (if provided)
 * @returns Adjusted interest rate
 */
export function getRefinanceInterestRate(
  baseRate: number,
  refinanceType: 'rate_and_term' | 'cash_out' | undefined,
  customAdjustment?: number
): number {
  if (refinanceType !== 'cash_out') {
    return baseRate;
  }
  
  // If user specified custom adjustment, use it
  if (customAdjustment !== undefined && customAdjustment !== null) {
    return baseRate + customAdjustment;
  }
  
  // Default: add 0.375% (middle of 0.25-0.50% range)
  return baseRate + 0.375;
}

