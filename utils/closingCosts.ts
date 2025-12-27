/**
 * Utility functions for calculating closing costs
 * This is the SINGLE SOURCE OF TRUTH for closing cost calculations
 */

import { ClosingCostItem } from '../types';
import { calculateLendersTitleInsurance } from '../services/loanMath';

/**
 * Safe number parser
 */
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

/**
 * Calculate the actual cost amount for a single closing cost item
 * This is the authoritative calculation logic used by loanMath.ts
 * 
 * @param item - The closing cost item
 * @param scenario - Scenario data needed for calculations
 * @param results - Calculated results (for values like totalLoanAmount, prepaidInterest)
 * @returns The calculated cost amount for this item
 */
export const calculateItemCost = (
  item: ClosingCostItem,
  scenario: {
    settlementDate?: string;
    purchasePrice: number;
    homeInsuranceYearly: number;
    propertyTaxYearly: number;
    hoaMonthly: number;
    interestRate: number;
  },
  results: {
    totalLoanAmount: number;
    prepaidInterest: number;
    prepaidInterestDays: number;
  }
): number => {
  if (!item || !item.id) return 0;

  // Prepaid Interest - special handling
  if (item.id === 'prepaid-interest') {
    if (scenario.settlementDate) {
      // Use calculated prepaid interest from settlement date
      return results.prepaidInterest;
    } else {
      // Use manual days input
      const days = item.days || 0;
      const annualInterest = results.totalLoanAmount * (scenario.interestRate / 100);
      const dailyInterest = annualInterest / 365;
      return dailyInterest * days;
    }
  }

  // Title Insurance - special handling
  if (item.id === 'title-insurance') {
    const manualAmount = safeNum(item.amount);
    if (manualAmount > 0) {
      return manualAmount;
    }
    return calculateLendersTitleInsurance(results.totalLoanAmount);
  }

  // Prepaid Insurance or Insurance Reserves
  if (item.id === 'prepaid-insurance' || item.id === 'insurance-reserves') {
    const months = item.months || 0;
    const monthlyCost = scenario.homeInsuranceYearly / 12;
    return monthlyCost * months;
  }

  // Tax Reserves
  if (item.id === 'tax-reserves') {
    const months = item.months || 0;
    const monthlyCost = scenario.propertyTaxYearly / 12;
    return monthlyCost * months;
  }

  // HOA Prepay
  if (item.id === 'hoa-prepay') {
    const months = item.months || 0;
    return scenario.hoaMonthly > 0 ? (scenario.hoaMonthly * months) : 0;
  }

  // All other items - check if fixed or percentage
  const val = safeNum(item.amount);
  
  if (item.isFixed) {
    return val;
  } else {
    // Percentage-based fees
    if (item.id === 'buyers-agent-commission' || item.id === 'hoa-transfer' || item.id === 'realtor-admin') {
      // These use purchase price
      return scenario.purchasePrice * (val / 100);
    } else {
      // All other percentage fees use loan amount (discount-points, misc-1, misc-2, misc-3, misc-4)
      return results.totalLoanAmount * (val / 100);
    }
  }
};

