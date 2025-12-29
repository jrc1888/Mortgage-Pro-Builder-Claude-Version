/**
 * Utility functions for formatting numbers, currency, percentages, and dates
 */

import { ClosingCostItem, Scenario, CalculatedResults } from '../types';

// Import APR calculator modules
import { calculateAPR as newCalculateAPR } from '../src/apr';
import { scenarioToAPRInput } from '../src/apr/adapter';

/**
 * Formats a number as USD currency with no decimals
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "$500,000")
 */
export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Formats a number as a percentage
 * @param rate - The rate to format (e.g., 6.5 for 6.5%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "6.50%")
 */
export const formatPercent = (rate: number, decimals: number = 2): string => {
  return `${rate.toFixed(decimals)}%`;
};

/**
 * Formats a date as MM/DD/YYYY
 * @param date - Date object or ISO string
 * @returns Formatted date string (e.g., "12/25/2024")
 */
export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return '';
  }
  
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${month}/${day}/${year}`;
};

/**
 * Calculates Annual Percentage Rate (APR) for a mortgage
 * Uses the new Reg Z/TILA compliant APR calculator when possible
 * Falls back to legacy calculation for backward compatibility
 * 
 * @param loanAmount - Total loan amount (including financed fees like MIP)
 * @param monthlyPayment - Monthly principal and interest payment
 * @param loanTermMonths - Loan term in months
 * @param upfrontCosts - Upfront costs PAID at closing that affect APR (points, origination fees - NOT financed)
 * @param isInterestOnly - Whether this is an interest-only loan
 * @param decimals - Number of decimal places for the result (default: 3)
 * @returns APR as a percentage (e.g., 6.697 for 6.697%)
 */
export const calculateAPR = (
  loanAmount: number,
  monthlyPayment: number,
  loanTermMonths: number,
  upfrontCosts: number = 0,
  isInterestOnly: boolean = false,
  decimals: number = 3
): number => {
  // Use legacy calculation for now (maintains backward compatibility)
  // The new calculator requires full scenario data - use calculateAPRFromScenario() for that
  return calculateAPRLegacy(loanAmount, monthlyPayment, loanTermMonths, upfrontCosts, isInterestOnly, decimals);
};

/**
 * Calculate APR from full Scenario and CalculatedResults (uses new Reg Z calculator)
 * This is the preferred method for accurate APR calculation
 */
export function calculateAPRFromScenario(
  scenario: Scenario,
  results: CalculatedResults
): number {
  try {
    // Convert scenario to APR input format
    const aprInput = scenarioToAPRInput(scenario, results);
    
    // Debug: Log key values for FHA/VA loans
    if (scenario.loanType === 'FHA' || scenario.loanType === 'VA') {
      console.log('APR Calculation Debug:', {
        loanType: scenario.loanType,
        baseLoanAmount: aprInput.base_loan_amount,
        financedUpfrontFees: aprInput.financed_upfront_fees,
        noteRate: aprInput.note_rate_initial,
        fees: aprInput.fees.filter(f => f.amount > 0).map(f => ({ name: f.name, amount: f.amount, category: f.category }))
      });
    }
    
    // Calculate APR using new Reg Z calculator
    const aprResult = newCalculateAPR(aprInput);
    
    // Validate result
    if (!aprResult || typeof aprResult.apr_annual !== 'number' || isNaN(aprResult.apr_annual)) {
      throw new Error(`Invalid APR result: ${aprResult?.apr_annual}`);
    }
    
    // Debug output for FHA/VA
    if (scenario.loanType === 'FHA' || scenario.loanType === 'VA') {
      console.log('APR Result:', {
        apr: aprResult.apr_annual,
        interestRate: scenario.interestRate,
        totalFinanceCharges: aprResult.total_finance_charges,
        netAmountFinanced: aprResult.net_amount_financed,
        noteAmount: aprResult.note_amount,
        converged: aprResult.debug_breakdown.solver_converged
      });
    }
    
    // Validate APR result (additional validation beyond what APRCalculator does)
    const interestRate = scenario.interestRate;
    
    // Check solver convergence
    if (!aprResult.debug_breakdown.solver_converged) {
      console.error('APR solver did not converge. Using result but accuracy may be compromised:', {
        apr: aprResult.apr_annual,
        iterations: aprResult.debug_breakdown.solver_iterations,
        loanType: scenario.loanType
      });
      // Note: We don't throw here because APRCalculator already validates convergence
      // This is just a safety check in case validation was bypassed
    }
    
    // Final sanity check: APR should be >= interest rate when finance charges exist
    // (Exception: if credits exceed fees, APR could be lower, but that's rare)
    if (aprResult.total_finance_charges > 0 && aprResult.apr_annual < interestRate) {
      const errorMsg = `APR validation failed: APR (${aprResult.apr_annual.toFixed(3)}%) is less than interest rate ` +
        `(${interestRate.toFixed(3)}%) despite positive finance charges ($${aprResult.total_finance_charges.toLocaleString()}). ` +
        `This should have been caught by APRCalculator validation.`;
      console.error(errorMsg, {
        apr: aprResult.apr_annual,
        interestRate,
        financeCharges: aprResult.total_finance_charges,
        netAmountFinanced: aprResult.net_amount_financed,
        noteAmount: aprResult.note_amount,
        converged: aprResult.debug_breakdown.solver_converged,
        loanType: scenario.loanType
      });
      // Throw error to prevent incorrect APR from being used
      throw new Error(errorMsg);
    }
    
    return aprResult.apr_annual;
  } catch (e) {
    // Fallback to legacy if new calculator fails
    console.error('New APR calculator error, using legacy method:', e);
    return calculateAPRLegacy(
      results.totalLoanAmount,
      results.monthlyPrincipalAndInterest,
      scenario.loanTermMonths,
      calculateAPRUpfrontCosts(scenario.closingCosts, results.totalLoanAmount),
      scenario.interestOnly || false
    );
  }
}

/**
 * Legacy APR calculation (maintained for backward compatibility)
 */
function calculateAPRLegacy(
  loanAmount: number,
  monthlyPayment: number,
  loanTermMonths: number,
  upfrontCosts: number = 0,
  isInterestOnly: boolean = false,
  decimals: number = 3
): number {
  if (loanAmount <= 0 || monthlyPayment <= 0 || loanTermMonths <= 0) {
    return 0;
  }

  // Net loan amount = amount borrower actually receives (after paying upfront costs)
  const netLoanAmount = loanAmount - upfrontCosts;
  if (netLoanAmount <= 0) {
    return 0;
  }

  // If no upfront costs, APR should equal the interest rate
  // We'll solve for it iteratively to be accurate
  
  // Start with a reasonable range - APR should be between 0 and a high rate
  // For mortgages, APR is typically 0-30%, but we'll use 0-1 (0-100%) to be safe
  let low = 0;
  let high = 1; // 100% as upper bound
  const tolerance = 0.0000001; // Very precise
  const maxIterations = 200;

  // Helper function to calculate present value of payments at given rate
  const presentValue = (rate: number): number => {
    if (rate === 0) {
      if (isInterestOnly) {
        // Interest-only: PV = sum of interest payments + principal at end
        return (monthlyPayment * loanTermMonths) + loanAmount;
      }
      return monthlyPayment * loanTermMonths;
    }
    const monthlyRate = rate / 12;
    if (monthlyRate >= 1) return 0; // Invalid rate
    
    if (isInterestOnly) {
      // Interest-only loan: monthly interest payments + balloon payment at end
      // PV of interest payments
      const pvInterest = monthlyPayment * (1 - Math.pow(1 + monthlyRate, -loanTermMonths)) / monthlyRate;
      // PV of balloon payment (full loan amount at end)
      const pvBalloon = loanAmount / Math.pow(1 + monthlyRate, loanTermMonths);
      return pvInterest + pvBalloon;
    } else {
      // Standard amortization: PV = Payment * [1 - (1 + r)^(-n)] / r
      const pv = monthlyPayment * (1 - Math.pow(1 + monthlyRate, -loanTermMonths)) / monthlyRate;
      return pv;
    }
  };

  // Binary search for APR
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const pv = presentValue(mid);
    const diff = pv - netLoanAmount;

    if (Math.abs(diff) < tolerance) {
      return parseFloat((mid * 100).toFixed(decimals));
    }

    if (diff > 0) {
      // PV too high, need higher rate to discount more
      low = mid;
    } else {
      // PV too low, need lower rate
      high = mid;
    }
    
    // Safety check: if bounds are too close, break
    if (high - low < 0.0000001) break;
  }

  // If we didn't converge, return the midpoint
  const result = parseFloat(((low + high) / 2 * 100).toFixed(decimals));
  
  // APR should never be less than 0
  return Math.max(0, result);
};

/**
 * Calculates upfront costs that affect APR
 * Includes: discount points and origination fees from Section A
 * 
 * @param closingCosts - Array of closing cost items
 * @param loanAmount - Total loan amount (for percentage-based costs)
 * @returns Total upfront costs that affect APR
 */
export const calculateAPRUpfrontCosts = (
  closingCosts: ClosingCostItem[],
  loanAmount: number
): number => {
  if (!closingCosts || closingCosts.length === 0 || loanAmount <= 0) {
    return 0;
  }

  let upfrontCosts = 0;

  // Section A costs that affect APR: discount points and origination fees
  const aprRelevantIds = [
    'discount-points', // Points
    'processing', // Administration Fee
    'tax-service', // Tax Service Fee
    'underwriting', // Underwriting Fee
    'wire-transfer' // Wire Transfer Fee
  ];

  closingCosts.forEach(item => {
    if (aprRelevantIds.includes(item.id)) {
      if (item.isFixed) {
        // Fixed dollar amount
        upfrontCosts += item.amount || 0;
      } else {
        // Percentage of loan amount
        upfrontCosts += (loanAmount * (item.amount || 0)) / 100;
      }
    }
  });

  return upfrontCosts;
};

