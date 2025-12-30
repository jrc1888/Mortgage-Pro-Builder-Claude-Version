/**
 * Adapter to convert from existing Scenario/CalculatedResults format
 * to the new APR calculator input format
 */

import { Scenario, CalculatedResults, LoanType } from '../../types';
import { APRInput, FinancedUpfrontFee } from './models';
import { calculateItemCost } from '../../utils/closingCosts';

/**
 * Convert Scenario and CalculatedResults to APRInput format
 */
export function scenarioToAPRInput(
  scenario: Scenario,
  results: CalculatedResults
): APRInput {
  // Determine loan type
  let loanType: 'conv' | 'fha' | 'va' | 'jumbo' | 'usda' = 'conv';
  if (scenario.loanType === LoanType.FHA) loanType = 'fha';
  else if (scenario.loanType === LoanType.VA) loanType = 'va';
  else if (scenario.loanType === LoanType.JUMBO) loanType = 'jumbo';
  else loanType = 'conv';

  // Determine structure
  let structure: 'fixed' | 'arm' | 'io' | 'io_arm' = 'fixed';
  if (scenario.interestOnly && scenario.armLoan) {
    structure = 'io_arm';
  } else if (scenario.interestOnly) {
    structure = 'io';
  } else if (scenario.armLoan) {
    structure = 'arm';
  }

  // Calculate base loan amount (before financed fees)
  const baseLoanAmount = scenario.purchasePrice - scenario.downPaymentAmount;

  // Build financed upfront fees
  // Use the actual financed MIP from results to ensure consistency
  const financedUpfrontFees: FinancedUpfrontFee[] = [];
  
  if (scenario.loanType === LoanType.FHA) {
    // Use the actual financed MIP from results (already calculated in loanMath)
    const ufmipAmount = results.financedMIP;
    if (ufmipAmount > 0) {
      financedUpfrontFees.push({
        name: 'FHA UFMIP',
        amount: ufmipAmount,
        is_finance_charge: true
      });
    }
  } else if (scenario.loanType === LoanType.VA) {
    // Use the actual financed funding fee from results
    const fundingFeeAmount = results.financedMIP;
    if (fundingFeeAmount > 0) {
      financedUpfrontFees.push({
        name: 'VA Funding Fee',
        amount: fundingFeeAmount,
        is_finance_charge: true
      });
    }
  }

  // Convert closing costs to fee format
  const fees = scenario.closingCosts.map(item => {
    // Calculate actual cost
    const cost = calculateItemCost(
      item,
      {
        settlementDate: scenario.settlementDate,
        purchasePrice: scenario.purchasePrice,
        homeInsuranceYearly: scenario.homeInsuranceYearly,
        propertyTaxYearly: scenario.propertyTaxYearly,
        hoaMonthly: scenario.hoaMonthly,
        interestRate: scenario.interestRate
      },
      {
        totalLoanAmount: results.totalLoanAmount,
        prepaidInterest: results.prepaidInterest,
        prepaidInterestDays: results.prepaidInterestDays
      }
    );

    // Determine paid_to and category
    let paidTo: 'lender' | 'broker' | 'third_party' | 'government' | 'investor' = 'third_party';
    let category: 'origination' | 'points' | 'underwriting' | 'processing' | 'title' | 'appraisal' | 'recording' | 'transfer_tax' | 'prepaid_interest' | 'taxes_insurance' | 'MI_upfront' | 'MI_monthly' | 'VA_funding_fee' | 'other' = 'other';

    if (item.category?.includes('Origination')) {
      paidTo = 'lender';
      if (item.id === 'discount-points') {
        category = 'points';
      } else if (item.id === 'underwriting') {
        category = 'underwriting';
      } else if (item.id === 'processing') {
        category = 'processing';
      } else {
        category = 'origination';
      }
    } else if (item.category?.includes('Title') || item.id?.includes('title')) {
      paidTo = 'third_party';
      category = 'title';
    } else if (item.id === 'appraisal') {
      paidTo = 'third_party';
      category = 'appraisal';
    } else if (item.id === 'recording-fee') {
      paidTo = 'government';
      category = 'recording';
    } else if (item.id === 'prepaid-interest') {
      paidTo = 'lender';
      category = 'prepaid_interest';
    }

    return {
      name: item.name,
      amount: cost,
      paid_to: paidTo,
      paid_by: 'borrower_cash' as const, // Default - could be enhanced
      required_for_credit: item.category?.includes('Origination') || false,
      category
    };
  });

  // Add lender credits and seller credits if applicable
  // Note: Seller credits reduce finance charges if used to pay finance charges (per Reg Z)
  const lenderCreditAmount = scenario.showLenderCredits && scenario.lenderCredits > 0
    ? (scenario.lenderCreditsMode === 'fixed' 
          ? scenario.lenderCredits 
        : (results.totalLoanAmount * scenario.lenderCredits / 100))
    : 0;
  
  // Seller concessions: If they exceed closing costs, they don't affect APR.
  // If they're used to pay finance charges, they reduce finance charges.
  // For simplicity, we assume seller credits reduce finance charges proportionally
  // (this is a conservative approach - actual treatment depends on how credits are applied)
  const sellerCreditAmount = scenario.showSellerConcessions && results.sellerConcessionsAmount > 0
    ? results.sellerConcessionsAmount
    : 0;
  
  const credits = (lenderCreditAmount > 0 || sellerCreditAmount > 0)
    ? {
        lender_credit: lenderCreditAmount > 0 ? lenderCreditAmount : undefined,
        seller_credit: sellerCreditAmount > 0 ? sellerCreditAmount : undefined
      }
    : undefined;

  // Build ARM params if applicable (simplified - would need more inputs)
  const armParams = scenario.armLoan ? {
    initial_fixed_months: 60, // Default 5/1 ARM
    margin: 0.0225, // Default margin
    index_initial: scenario.interestRate / 100 - 0.0225, // Estimate index from rate
    periodic_cap: 0.02, // 2% cap
    lifetime_cap: 0.05, // 5% lifetime cap
    lifetime_floor: 0.025, // 2.5% floor
    adjust_freq_months: 12, // Annual adjustments
    use_constant_index: true
  } : undefined;

  return {
    loan_type: loanType,
    structure,
    base_loan_amount: baseLoanAmount,
    note_rate_initial: scenario.interestRate / 100, // Convert to decimal
    term_months: scenario.interestOnly ? (scenario.ioTermMonths || 120) + (scenario.piTermMonths || scenario.loanTermMonths) : scenario.loanTermMonths,
    io_months: scenario.interestOnly ? (scenario.ioTermMonths || 120) : undefined,
    arm_params: armParams,
    financed_upfront_fees: financedUpfrontFees.length > 0 ? financedUpfrontFees : undefined,
    fees,
    credits
  };
}

