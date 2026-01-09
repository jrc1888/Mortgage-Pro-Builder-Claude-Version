

import { Scenario, CalculatedResults, LoanType } from '../types';
import { calculateItemCost } from '../utils/closingCosts';
import { getMaxLTVForRefinance, calculateMaxCashOut, getRefinanceInterestRate } from './refinanceHelpers';

export const calculatePMT = (rate: number, nper: number, pv: number): number => {
  if (rate === 0 || nper === 0) return 0;
  const pvif = Math.pow(1 + rate, nper);
  const pmt = (rate * pv * pvif) / (pvif - 1);
  return isNaN(pmt) ? 0 : pmt;
};

// Safe number parser
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

// Calculate prepaid interest days from settlement date to end of month
export const calculatePrepaidInterestDays = (settlementDateISO?: string): number => {
  if (!settlementDateISO) return 0;
  
  try {
    const settlementDate = new Date(settlementDateISO);
    if (isNaN(settlementDate.getTime())) return 0;
    
    // Get the last day of the settlement month
    const year = settlementDate.getFullYear();
    const month = settlementDate.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Calculate days from settlement date to end of month (inclusive)
    const daysDiff = lastDayOfMonth.getDate() - settlementDate.getDate() + 1;
    
    return Math.max(0, daysDiff);
  } catch {
    return 0;
  }
};

// Calculate total days in the month for a given date
export const getTotalDaysInMonth = (dateISO?: string): number => {
  if (!dateISO) return 0;
  
  try {
    const date = new Date(dateISO);
    if (isNaN(date.getTime())) return 0;
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    return lastDayOfMonth.getDate();
  } catch {
    return 0;
  }
};

// Calculate prepaid interest amount
export const calculatePrepaidInterest = (
  loanAmount: number,
  annualInterestRate: number,
  settlementDateISO?: string,
  manualDays?: number
): number => {
  if (loanAmount <= 0 || annualInterestRate <= 0) return 0;
  
  let days = 0;
  if (settlementDateISO) {
    days = calculatePrepaidInterestDays(settlementDateISO);
  } else if (manualDays !== undefined) {
    days = manualDays;
  } else {
    return 0;
  }
  
  if (days === 0) return 0;
  
  // Daily interest = (Loan Amount × Annual Rate) / 365
  const dailyInterest = (loanAmount * (annualInterestRate / 100)) / 365;
  
  // Prepaid interest = Daily Interest × Days
  return dailyInterest * days;
};

// Calculate interest credit (remaining days in month after prepaid interest days)
// This gives a credit for the days from first of month to settlement date
// Credit = (Days from 1st of month to settlement date) × Daily Interest
export const calculateInterestCredit = (
  loanAmount: number,
  annualInterestRate: number,
  settlementDateISO?: string
): number => {
  if (loanAmount <= 0 || annualInterestRate <= 0 || !settlementDateISO) return 0;
  
  try {
    const settlementDate = new Date(settlementDateISO);
    if (isNaN(settlementDate.getTime())) return 0;
    
    // Days from 1st of month to settlement date (exclusive of settlement date)
    // If settlement is on the 15th, credit is for days 1-14 (14 days)
    const daysFromFirstOfMonth = settlementDate.getDate() - 1;
    
    if (daysFromFirstOfMonth <= 0) return 0;
    
    // Daily interest = (Loan Amount × Annual Rate) / 365
    const dailyInterest = (loanAmount * (annualInterestRate / 100)) / 365;
    
    // Interest credit = Daily Interest × Days from first of month
    return dailyInterest * daysFromFirstOfMonth;
  } catch {
    return 0;
  }
};

// Calculate Lenders Title Insurance based on loan amount tiers
export const calculateLendersTitleInsurance = (loanAmount: number): number => {
  if (loanAmount <= 0) return 0;
  
  if (loanAmount <= 250000) {
    // ≤ $250,000: 0.37% × loan amount
    return loanAmount * 0.0037;
  } else if (loanAmount < 550000) {
    // $250,000–$550,000 (exclusive of $550k): 0.30% × loan amount
    return loanAmount * 0.0030;
  } else {
    // ≥ $550,000: $1,650 flat
    return 1650;
  }
};

export const calculateScenario = (scenario: Scenario): CalculatedResults => {
  // Ensure we work with numbers even if state has bad data
  const purchasePrice = safeNum(scenario.purchasePrice);
  const downPaymentAmount = safeNum(scenario.downPaymentAmount);
  let interestRate = safeNum(scenario.interestRate);
  const loanTermMonths = safeNum(scenario.loanTermMonths) || 360;
  const propertyTaxYearly = safeNum(scenario.propertyTaxYearly);
  const homeInsuranceYearly = safeNum(scenario.homeInsuranceYearly);
  const hoaMonthly = safeNum(scenario.hoaMonthly);
  // For refinances: Earnest money is not applicable (no purchase contract)
  const earnestMoney = scenario.transactionType === 'Refinance' ? 0 : safeNum(scenario.earnestMoney);
  
  // Logic Update: Only calculate credits if toggled ON.
  // The raw values remain in the scenario object for persistence, but we treat them as 0 for math if hidden.
  // For refinances: Seller concessions are not applicable (no seller in a refi)
  const sellerConcessionsVal = (scenario.transactionType === 'Refinance' || !scenario.showSellerConcessions) 
    ? 0 
    : safeNum(scenario.sellerConcessions);
  
  // Calculate seller concessions amount (handle both dollar and percentage modes)
  let sellerConcessionsInput = 0;
  if (sellerConcessionsVal > 0) {
    if (scenario.sellerConcessionsMode === 'percent') {
      // Percentage mode: calculate based on purchase price
      sellerConcessionsInput = purchasePrice * (sellerConcessionsVal / 100);
    } else {
      // Fixed dollar mode
      sellerConcessionsInput = sellerConcessionsVal;
    }
  }

  // REFINANCE LOGIC
  const isRefinance = scenario.transactionType === 'Refinance';
  let refinanceDetails: CalculatedResults['refinanceDetails'] | undefined = undefined;
  
  if (isRefinance) {
    // For refinances, property value is stored in purchasePrice
    const propertyValue = purchasePrice;
    
    // Get existing loan payoffs
    const existingLoanPayoff = safeNum(scenario.existingLoanPayoff);
    const secondMortgagePayoff = safeNum(scenario.secondMortgagePayoff);
    const totalPayoff = existingLoanPayoff + secondMortgagePayoff;
    
    // Use rate and term LTV limits (more conservative, but we'll allow cash back if it occurs)
    // For now, use rate and term limits - cash out classification happens if cash back > 1%
    const maxLTV = getMaxLTVForRefinance(
      scenario.loanType,
      'rate_and_term', // Use rate and term limits
      scenario.creditScore
    );
    
    // Calculate maximum base loan amount (before UFMIP)
    // Note: For FHA, UFMIP can be added on top, so base loan can be up to maxLTV
    const maxBaseLoanAmount = propertyValue * (maxLTV / 100);
    
    // Determine if closing costs should be financed (default: true for refis)
    const financeClosingCosts = scenario.financeClosingCosts !== false; // Default to true
    
    // Check if user has manually entered a loan amount
    const manualLoanAmount = safeNum(scenario.refinanceLoanAmount);
    const useManualLoanAmount = manualLoanAmount > 0;
    
    let baseLoanAmountBeforeUFMIP = 0;
    
    if (useManualLoanAmount) {
      // Manual loan amount mode: work backwards from loan amount
      baseLoanAmountBeforeUFMIP = manualLoanAmount; // Will subtract UFMIP later
    } else {
      // Forward calculation: start with payoffs + estimated closing costs
      // This will be finalized after closing costs are calculated
      const estimatedClosingCosts = 0; // Will be calculated properly later
      baseLoanAmountBeforeUFMIP = Math.min(totalPayoff + (financeClosingCosts ? estimatedClosingCosts : 0), maxBaseLoanAmount);
    }
    
    // Store refinance details (will be updated after closing costs calculation)
    refinanceDetails = {
      propertyValue,
      existingLoanPayoff,
      secondMortgagePayoff,
      totalPayoff,
      cashOutRequested: 0, // Not used in new logic
      cashOutAmount: 0, // Will be calculated as equity
      cashOutReduced: false,
      maxCashOutAvailable: 0,
      financedClosingCosts: 0, // Will be calculated later
      netCashToBorrower: 0, // Will be calculated later
      cashNeededAtClosing: 0, // Will be calculated later
      maxLoanAmount: maxBaseLoanAmount,
      baseLoanAmountBeforeUFMIP,
      useManualLoanAmount
    };
  }

  // 1. Base Numbers
  // For purchases: baseLoanAmount = purchasePrice - downPaymentAmount
  // For refinances: baseLoanAmount will be calculated based on payoff + costs + cash out
  let baseLoanAmount: number;
  
  if (isRefinance && refinanceDetails) {
    // For refinances, we'll calculate this after closing costs
    // For now, use a placeholder that will be updated
    baseLoanAmount = refinanceDetails.baseLoanAmountBeforeUFMIP;
  } else {
    // Purchase: standard calculation
    baseLoanAmount = purchasePrice - downPaymentAmount;
  }
  
  // 2. Upfront MIP / Funding Fee Logic
  // For refinances, this will be recalculated after base loan is finalized
  let ufmipRate = 0;
  if (scenario.loanType === LoanType.FHA) {
    ufmipRate = 0.0175; // 1.75% standard (for purchases and standard refis)
    // Note: FHA streamline refis use 0.01% but we'll use standard for now
  } else if (scenario.loanType === LoanType.VA) {
    ufmipRate = scenario.ufmipRate > 0 ? scenario.ufmipRate / 100 : 0.0215; 
  }
  
  let financedMIP = (scenario.loanType === LoanType.FHA || scenario.loanType === LoanType.VA) 
    ? baseLoanAmount * ufmipRate 
    : 0;

  let totalLoanAmount = baseLoanAmount + financedMIP;
  
  // Note: LTV and MI calculations will be done AFTER refinance logic updates baseLoanAmount
  // (for refinances, baseLoanAmount includes financed closing costs, which affects LTV and MI)

  // 3. Monthly P&I (will use updated totalLoanAmount after refinance logic)
  // For now, calculate with initial values - will recalculate if refinance logic changes amounts
  const monthlyRate = (interestRate / 100) / 12;
  let monthlyPrincipalAndInterest = 0;

  if (scenario.interestOnly) {
    // Interest Only Calculation: During IO period, only interest is paid
    // After IO period, loan amortizes over P&I term
    const ioTermMonths = scenario.ioTermMonths || 120;
    const piTermMonths = scenario.piTermMonths || loanTermMonths;
    
    // For display purposes, show the IO payment (which is what borrower pays during IO period)
    // The actual payment will change after IO period, but we show the initial IO payment
    monthlyPrincipalAndInterest = totalLoanAmount * monthlyRate;
    
    // Note: The full payment schedule (IO + amortizing) is handled in APR calculation
    // This monthly payment is for display/qualifying purposes during the IO period
  } else {
    // Standard Amortization
    monthlyPrincipalAndInterest = calculatePMT(monthlyRate, loanTermMonths, totalLoanAmount);
  }

  // Monthly MI will be calculated AFTER refinance logic updates baseLoanAmount and totalLoanAmount
  // (because LTV depends on baseLoanAmount, and MI depends on LTV)
  let monthlyMI = 0;
  let miRatePercent = 0;
  
  // Store initial values for later recalculation if needed
  let initialTotalLoanAmount = totalLoanAmount;

  // 5. DPA
  let dpaPayment = 0;
  if (scenario.dpa.active) {
    if (scenario.dpa.isDeferred) {
        dpaPayment = 0;
    } else {
        const dpaAmount = safeNum(scenario.dpa.amount);
        const dpaRate = safeNum(scenario.dpa.rate);
        const dpaTerm = safeNum(scenario.dpa.termMonths) || 120;
        
        const dpaMonthlyRate = (dpaRate / 100) / 12;
        dpaPayment = calculatePMT(dpaMonthlyRate, dpaTerm, dpaAmount);
    }
  }

  // 5b. Second DPA
  let dpa2Payment = 0;
  if (scenario.dpa2?.active) {
    if (scenario.dpa2.isDeferred) {
        dpa2Payment = 0;
    } else {
        const dpa2Amount = safeNum(scenario.dpa2.amount);
        const dpa2Rate = safeNum(scenario.dpa2.rate);
        const dpa2Term = safeNum(scenario.dpa2.termMonths) || 120;
        
        const dpa2MonthlyRate = (dpa2Rate / 100) / 12;
        dpa2Payment = calculatePMT(dpa2MonthlyRate, dpa2Term, dpa2Amount);
    }
  }

  // Common fixed monthly costs (Tax, Ins, MI, HOA, DPA, DPA2)
  // NOTE: monthlyMI will be calculated later after LTV is determined, so we'll recalculate fixedMonthlyCosts then
  // For now, calculate without MI - it will be added later
  let fixedMonthlyCosts = (propertyTaxYearly / 12) + (homeInsuranceYearly / 12) + hoaMonthly + dpaPayment + dpa2Payment;

  // 6. Buydown Calculation (Subsidy)
  let buydownCost = 0;
  const buydownSchedule = [];
  
  if (scenario.buydown.active) {
    let maxYears = 3;
    if (scenario.buydown.type === '3-2-1') maxYears = 4;
    if (scenario.buydown.type === '1-0') maxYears = 2; 
    
    for (let i = 1; i <= maxYears; i++) {
        let drop = 0;
        
        if (scenario.buydown.type === '2-1') {
            if (i === 1) drop = 2;
            if (i === 2) drop = 1;
        } else if (scenario.buydown.type === '1-0') {
             if (i === 1) drop = 1;
        } else if (scenario.buydown.type === '1-1') {
             if (i === 1 || i === 2) drop = 1;
        } else if (scenario.buydown.type === '3-2-1') {
             if (i === 1) drop = 3;
             if (i === 2) drop = 2;
             if (i === 3) drop = 1;
        }

        let yearRate = interestRate;
        let subsidy = 0;
        let yearPayment = monthlyPrincipalAndInterest; 

        if (drop > 0) {
            yearRate = interestRate - drop;
            const reducedMonthlyRate = (yearRate / 100) / 12;
            
            if (scenario.interestOnly && (scenario.loanType === LoanType.CONVENTIONAL || scenario.loanType === LoanType.JUMBO)) {
                 yearPayment = totalLoanAmount * reducedMonthlyRate;
            } else {
                 yearPayment = calculatePMT(reducedMonthlyRate, loanTermMonths, totalLoanAmount);
            }
            
            subsidy = monthlyPrincipalAndInterest - yearPayment;
            buydownCost += (subsidy * 12);
        }
        
        buydownSchedule.push({
            year: i,
            rate: yearRate,
            payment: yearPayment,
            subsidy: subsidy,
            fullPayment: yearPayment + fixedMonthlyCosts
        });
    }
  }

  // 7. Closing Costs
  // Calculate prepaid interest first (from settlement date if available, otherwise from manual input)
  let prepaidInterestDays = calculatePrepaidInterestDays(scenario.settlementDate);
  let prepaidInterest = scenario.settlementDate 
    ? calculatePrepaidInterest(totalLoanAmount, interestRate, scenario.settlementDate)
    : 0;
  
  // If interest credit is enabled, count days from 1st of month UP TO AND INCLUDING settlement date
  // This number is then made negative to show as a credit
  if (scenario.showInterestCredit && scenario.settlementDate) {
    try {
      const settlementDate = new Date(scenario.settlementDate);
      if (!isNaN(settlementDate.getTime())) {
        // Days from 1st of month up to and including settlement date
        // If settlement is on the 5th, that's 5 days (1, 2, 3, 4, 5)
        const daysIncludingSettlement = settlementDate.getDate();
        
        // Make it negative (credit)
        prepaidInterestDays = -daysIncludingSettlement;
        
        // Calculate daily interest
        const dailyInterest = (totalLoanAmount * (interestRate / 100)) / 365;
        
        // Prepaid interest becomes negative (credit) = -(days including settlement × daily interest)
        prepaidInterest = -(dailyInterest * daysIncludingSettlement);
      }
    } catch (error) {
      console.warn('Error calculating interest credit:', error);
      // Fall back to normal prepaid interest calculation
    }
  }
  
  // Calculate closing costs - will recalculate after refinance logic if needed
  // (because financedMIP might change for refinances)
  let totalClosingCosts = (scenario.closingCosts || []).reduce((sum, item) => {
    const itemCost = calculateItemCost(
      item,
      {
        settlementDate: scenario.settlementDate,
        purchasePrice,
        homeInsuranceYearly,
        propertyTaxYearly,
        hoaMonthly,
        interestRate
      },
      {
        totalLoanAmount,
        prepaidInterest,
        prepaidInterestDays,
        financedMIP
      }
    );
    return sum + itemCost;
  }, 0) + buydownCost;
  
  // REFINANCE: Finalize loan amount and calculate equity/cash to borrower
  if (isRefinance && refinanceDetails) {
    const propertyValue = refinanceDetails.propertyValue;
    const totalPayoff = refinanceDetails.totalPayoff;
    const maxBaseLoanAmount = refinanceDetails.maxLoanAmount;
    
    // Determine how much closing costs to finance (default: finance up to available)
    const financeClosingCosts = scenario.financeClosingCosts !== false; // Default true
    
    // Check if using manual loan amount (work backwards)
    const useManualLoanAmount = refinanceDetails.useManualLoanAmount && safeNum(scenario.refinanceLoanAmount) > 0;
    
    if (useManualLoanAmount) {
      // ============================================================================
      // MANUAL LOAN AMOUNT MODE (Refinance)
      // ============================================================================
      // User enters the TOTAL loan amount they want (base loan + UFMIP/funding fee)
      // System works backwards to calculate:
      //   1. Base loan amount (before UFMIP)
      //   2. How much closing costs can be financed
      //   3. Equity/cash available to borrower
      //
      // IMPORTANT: refinanceLoanAmount represents TOTAL loan amount including UFMIP
      // For FHA: Total = Base + (Base × 1.75%)
      // For VA: Total = Base + (Base × Funding Fee %)
      // ============================================================================
      
      const manualLoanAmount = safeNum(scenario.refinanceLoanAmount);
      
      // Validate manual loan amount is reasonable
      if (manualLoanAmount <= 0) {
        throw new Error('Manual loan amount must be greater than zero');
      }
      if (manualLoanAmount > propertyValue * 1.1) {
        // Allow up to 110% of property value to account for UFMIP on high-LTV loans
        console.warn(`Manual loan amount ($${manualLoanAmount.toLocaleString()}) exceeds 110% of property value ($${propertyValue.toLocaleString()})`);
      }
      
      // Calculate UFMIP/funding fee rate based on loan type
      let ufmipRateRefi = 0;
      if (scenario.loanType === LoanType.FHA) {
        ufmipRateRefi = 0.0175; // FHA standard: 1.75%
      } else if (scenario.loanType === LoanType.VA) {
        ufmipRateRefi = scenario.ufmipRate > 0 ? scenario.ufmipRate / 100 : 0.0215; // VA default: 2.15%
      }
      
      // Calculate base loan amount (before UFMIP) by working backwards
      // Math: manualLoanAmount = baseLoanAmount + (baseLoanAmount × ufmipRate)
      //       manualLoanAmount = baseLoanAmount × (1 + ufmipRate)
      //       baseLoanAmount = manualLoanAmount / (1 + ufmipRate)
      const finalBaseLoanAmountBeforeUFMIP = ufmipRateRefi > 0 
        ? manualLoanAmount / (1 + ufmipRateRefi)
        : manualLoanAmount;
      
      // Validate calculated base loan amount is reasonable
      if (finalBaseLoanAmountBeforeUFMIP <= 0) {
        throw new Error('Calculated base loan amount is invalid. Please check manual loan amount entry.');
      }
      if (finalBaseLoanAmountBeforeUFMIP > maxBaseLoanAmount * 1.01) {
        // Allow 1% tolerance for rounding
        console.warn(`Calculated base loan amount ($${finalBaseLoanAmountBeforeUFMIP.toLocaleString()}) exceeds max LTV limit ($${maxBaseLoanAmount.toLocaleString()})`);
      }
      
      // Calculate how much closing costs can be financed
      // Available space = base loan - existing loan payoffs
      let financedClosingCostsAmount = 0;
      if (financeClosingCosts) {
        const availableForCosts = finalBaseLoanAmountBeforeUFMIP - totalPayoff;
        financedClosingCostsAmount = Math.min(totalClosingCosts, Math.max(0, availableForCosts));
      }
      
      // Calculate equity/cash available: Base Loan - Payoffs - Financed Closing Costs
      // Positive equity = cash back to borrower
      // Negative equity = cash required from borrower
      const equity = finalBaseLoanAmountBeforeUFMIP - totalPayoff - financedClosingCostsAmount;
      
      refinanceDetails.financedClosingCosts = financedClosingCostsAmount;
      refinanceDetails.baseLoanAmountBeforeUFMIP = finalBaseLoanAmountBeforeUFMIP;
      refinanceDetails.cashOutAmount = Math.max(0, equity); // Cash back (if positive)
      
      // Update base loan amount for use in rest of calculation
      baseLoanAmount = finalBaseLoanAmountBeforeUFMIP;
      
      // Recalculate UFMIP and total loan amount to verify math
      // This should match the manualLoanAmount entered by user (within rounding)
      financedMIP = (scenario.loanType === LoanType.FHA || scenario.loanType === LoanType.VA)
        ? baseLoanAmount * ufmipRateRefi
        : 0;
      
      totalLoanAmount = baseLoanAmount + financedMIP;
      
      // Verify the calculated total matches what user entered (within $1 tolerance for rounding)
      const difference = Math.abs(totalLoanAmount - manualLoanAmount);
      if (difference > 1) {
        console.warn(`Calculated total loan amount ($${totalLoanAmount.toLocaleString()}) does not match manual entry ($${manualLoanAmount.toLocaleString()}). Difference: $${difference.toFixed(2)}`);
      }
      
      // Calculate net cash to borrower (including lender credits and unfinanced costs)
      const lenderCreditsForCashCalc = scenario.showLenderCredits 
        ? (scenario.lenderCreditsMode === 'percent' 
            ? totalLoanAmount * (safeNum(scenario.lenderCredits) / 100)
            : safeNum(scenario.lenderCredits))
        : 0;
      
      const unfinancedCosts = totalClosingCosts - financedClosingCostsAmount;
      // Net cash = equity (cash back from loan) + lender credits - unfinanced costs
      refinanceDetails.netCashToBorrower = equity + lenderCreditsForCashCalc - unfinancedCosts;
      
      if (refinanceDetails.netCashToBorrower < 0) {
        refinanceDetails.cashNeededAtClosing = Math.abs(refinanceDetails.netCashToBorrower);
      } else {
        refinanceDetails.cashNeededAtClosing = 0;
      }
    } else {
      // Forward calculation mode: calculate loan from payoffs and costs
      // Calculate how much closing costs can be financed (up to available in loan)
      let financedClosingCostsAmount = 0;
      if (financeClosingCosts) {
        // Available for closing costs = max base loan - payoff
        const availableForCosts = maxBaseLoanAmount - totalPayoff;
        financedClosingCostsAmount = Math.min(totalClosingCosts, Math.max(0, availableForCosts));
      }
      refinanceDetails.financedClosingCosts = financedClosingCostsAmount;
      
      // Calculate base loan amount: payoffs + financed closing costs
      // This may result in equity (cash back) if base loan > payoffs + costs
      let finalBaseLoanAmountBeforeUFMIP = totalPayoff + financedClosingCostsAmount;
      
      // Cap at max LTV
      finalBaseLoanAmountBeforeUFMIP = Math.min(finalBaseLoanAmountBeforeUFMIP, maxBaseLoanAmount);
      
      // Calculate equity: Base Loan - Payoffs - Financed Closing Costs
      const equity = finalBaseLoanAmountBeforeUFMIP - totalPayoff - financedClosingCostsAmount;
      
      // Update base loan amount for refinance
      baseLoanAmount = finalBaseLoanAmountBeforeUFMIP;
      refinanceDetails.baseLoanAmountBeforeUFMIP = finalBaseLoanAmountBeforeUFMIP;
      refinanceDetails.cashOutAmount = Math.max(0, equity); // Cash back (if positive)
      
      // Recalculate UFMIP based on new base loan amount
      let ufmipRateRefi = 0;
      if (scenario.loanType === LoanType.FHA) {
        ufmipRateRefi = 0.0175;
      } else if (scenario.loanType === LoanType.VA) {
        ufmipRateRefi = scenario.ufmipRate > 0 ? scenario.ufmipRate / 100 : 0.0215;
      }
      
      // Update UFMIP and total loan amount for refinance
      financedMIP = (scenario.loanType === LoanType.FHA || scenario.loanType === LoanType.VA)
        ? baseLoanAmount * ufmipRateRefi
        : 0;
      
      totalLoanAmount = baseLoanAmount + financedMIP;
      
      // Calculate net cash to borrower (including lender credits and unfinanced costs)
      const lenderCreditsForCashCalc = scenario.showLenderCredits 
        ? (scenario.lenderCreditsMode === 'percent' 
            ? totalLoanAmount * (safeNum(scenario.lenderCredits) / 100)
            : safeNum(scenario.lenderCredits))
        : 0;
      
      const unfinancedCosts = totalClosingCosts - financedClosingCostsAmount;
      // Net cash = equity (cash back from loan) + lender credits - unfinanced costs
      refinanceDetails.netCashToBorrower = equity + lenderCreditsForCashCalc - unfinancedCosts;
      
      if (refinanceDetails.netCashToBorrower < 0) {
        refinanceDetails.cashNeededAtClosing = Math.abs(refinanceDetails.netCashToBorrower);
      } else {
        refinanceDetails.cashNeededAtClosing = 0;
      }
    }
    
    // After refinance logic, recalculate monthly P&I if totalLoanAmount changed
    if (isRefinance && totalLoanAmount !== initialTotalLoanAmount) {
      const updatedMonthlyRate = (interestRate / 100) / 12;
      if (scenario.interestOnly) {
        const ioTermMonths = scenario.ioTermMonths || 120;
        monthlyPrincipalAndInterest = totalLoanAmount * updatedMonthlyRate;
      } else {
        monthlyPrincipalAndInterest = calculatePMT(updatedMonthlyRate, loanTermMonths, totalLoanAmount);
      }
    }
  }

  // LTV calculation: MUST be done AFTER refinance logic updates baseLoanAmount
  // For refinances with financed closing costs, this ensures LTV includes those costs
  const propertyValueForLTV = isRefinance ? (refinanceDetails?.propertyValue || purchasePrice) : purchasePrice;
  const ltv = propertyValueForLTV > 0 ? (baseLoanAmount / propertyValueForLTV) * 100 : 0;

  // Monthly MI calculation: depends on LTV, so must be after LTV is calculated
  if (scenario.manualMI !== null && scenario.manualMI !== undefined) {
    monthlyMI = safeNum(scenario.manualMI);
    // Reverse calculate the % for display if manual
    miRatePercent = totalLoanAmount > 0 ? (monthlyMI * 12 / totalLoanAmount) * 100 : 0;
  } else {
    if (scenario.loanType === LoanType.FHA) {
      // FHA Rules (Annual):
      // IMPORTANT: FHA MI is calculated on BASE loan amount (before UFMIP), not total loan amount
      // This is per HUD guidelines - UFMIP is financed separately and does not affect MI calculation
      const factor = ltv > 95 ? 0.0055 : 0.0050; 
      miRatePercent = factor * 100;
      monthlyMI = (baseLoanAmount * factor) / 12;
    } else if (scenario.loanType === LoanType.CONVENTIONAL && ltv > 80) {
      // Standard Conventional Logic (Simplified)
      // Conventional MI is calculated on total loan amount (including any financed fees)
      let factor = 0;
      if (ltv > 95) factor = 0.0095;
      else if (ltv > 90) factor = 0.0075;
      else if (ltv > 85) factor = 0.0048;
      else factor = 0.0028;

      miRatePercent = factor * 100;
      monthlyMI = (totalLoanAmount * factor) / 12;
    }
  }

  // Recalculate fixedMonthlyCosts now that monthlyMI is known
  fixedMonthlyCosts = (propertyTaxYearly / 12) + (homeInsuranceYearly / 12) + monthlyMI + hoaMonthly + dpaPayment + dpa2Payment;

  // 8. Seller Concessions & Lender Credits Logic
  // For refinances: Seller concessions are not applicable
  const propertyValueForCalc = isRefinance ? (refinanceDetails?.propertyValue || purchasePrice) : purchasePrice;
  const sellerConcessionsPercent = (!isRefinance && propertyValueForCalc > 0) 
    ? (sellerConcessionsInput / propertyValueForCalc) * 100 
    : 0;
  
  // Lender Credits (applicable to both purchases and refinances)
  const lenderCreditsVal = scenario.showLenderCredits ? safeNum(scenario.lenderCredits) : 0;
  let lenderCreditsAmount = 0;
  
  if (scenario.lenderCreditsMode === 'percent') {
      lenderCreditsAmount = totalLoanAmount * (lenderCreditsVal / 100);
  } else {
      lenderCreditsAmount = lenderCreditsVal;
  }
  
  // Determine Max Allowed % based on Guidelines (only for purchases)
  let maxConcessionsPercent = 0;
  if (!isRefinance) {
    if (scenario.loanType === LoanType.FHA) maxConcessionsPercent = 6;
    else if (scenario.loanType === LoanType.VA) maxConcessionsPercent = 4;
    else if (scenario.loanType === LoanType.CONVENTIONAL) {
        if (ltv > 90) maxConcessionsPercent = 3;
        else if (ltv > 75) maxConcessionsPercent = 6;
        else maxConcessionsPercent = 9;
    } else if (scenario.loanType === LoanType.JUMBO) {
        maxConcessionsPercent = 3; // Jumbo minimum is 3%, can go higher but using 3% for now
    }
  }
  
  const maxConcessionsAllowed = (!isRefinance && purchasePrice > 0) 
    ? purchasePrice * (maxConcessionsPercent / 100) 
    : 0;

  // Warnings (only for purchases - refinances don't have seller concessions)
  const totalCredits = lenderCreditsAmount + sellerConcessionsInput;
  
  // Seller concessions can be used for everything EXCEPT UFMIP/VA Funding Fee
  // Section J (D + I) = totalClosingCosts - buydownCost (buydown is not in Section J)
  // Note: totalClosingCosts already includes UFMIP/VA Funding Fee (it's in Section B)
  const sectionJTotal = totalClosingCosts - buydownCost;
  
  // Closing Costs to be Paid = Section J - Financed Closing Costs (UFMIP/VA Funding Fee)
  // This is what seller concessions can pay (everything except UFMIP/VA Funding Fee)
  // This MUST match the "Closing Costs to be Paid" line in Section J display
  const closingCostsToBePaid = sectionJTotal - financedMIP;
  
  // Net Closing Costs = Closing Costs to be Paid - Seller Concessions (capped at closingCostsToBePaid) - Lender Credits
  // IMPORTANT: Only apply seller concessions up to closingCostsToBePaid
  // Unused seller concessions (excess) should NOT reduce cash to close
  // Lender credits can be applied to all closing costs (including UFMIP/VA Funding Fee)
  // This matches Section J: Net = Closing Costs to be Paid - Seller Concessions Applied - Lender Credits
  const sellerConcessionsApplied = Math.min(sellerConcessionsInput, closingCostsToBePaid);
  const lenderCreditsApplied = Math.min(lenderCreditsAmount, closingCostsToBePaid - sellerConcessionsApplied);
  const netClosingCosts = Math.max(0, closingCostsToBePaid - sellerConcessionsApplied - lenderCreditsApplied);
  
  // Unused seller concessions = seller concessions that exceed "Closing Costs to be Paid"
  // IMPORTANT: Compare seller concessions to "Closing Costs to be Paid" (Section J - UFMIP/VA Funding Fee)
  // NOT to total closing costs or Section J total
  // This matches the Section J display exactly: closingCostsToBePaid = totalJ - financedClosingCosts
  const unusedSellerConcessions = (!isRefinance && sellerConcessionsInput > closingCostsToBePaid) 
    ? sellerConcessionsInput - closingCostsToBePaid 
    : 0;
  
  // For backward compatibility, keep nonFinancedClosingCosts (same as closingCostsToBePaid)
  const nonFinancedClosingCosts = closingCostsToBePaid;
  
  // Check if concessions are excessive - show warning if seller concessions exceed "Closing Costs to be Paid"
  // IMPORTANT: This must compare to closingCostsToBePaid, NOT sectionJTotal or totalClosingCosts
  // For FHA/VA loans: closingCostsToBePaid = Section J - UFMIP/VA Funding Fee (what seller concessions can pay)
  const isConcessionsExcessive = (!isRefinance && unusedSellerConcessions > 0);
  
  // Debug log for FHA/VA loans to verify calculation
  if (!isRefinance && (scenario.loanType === LoanType.FHA || scenario.loanType === LoanType.VA) && sellerConcessionsInput > 0) {
    console.log('FHA/VA Seller Concessions Check:', {
      'Section J Total (D+I)': sectionJTotal.toFixed(2),
      'Financed MIP/Fee': financedMIP.toFixed(2),
      'Closing Costs to be Paid (J - MIP)': closingCostsToBePaid.toFixed(2),
      'Seller Concessions': sellerConcessionsInput.toFixed(2),
      'Unused Concessions': unusedSellerConcessions.toFixed(2),
      'Should Show Warning': unusedSellerConcessions > 0
    });
  }

  // 10. Cash / Funds Required
  const dpaAmount = scenario.dpa.active ? safeNum(scenario.dpa.amount) : 0;
  const dpa2Amount = scenario.dpa2?.active ? safeNum(scenario.dpa2.amount) : 0;
  const totalDPAAmount = dpaAmount + dpa2Amount;
  
  // 10. Cash / Funds Required
  // For purchases: Total funds required = down + net closing costs - dpa - dpa2
  // For refinances: Based on netCashToBorrower (negative = cash required, positive = cash back)
  let totalFundsRequired: number;
  let cashToClose: number;
  
  if (isRefinance && refinanceDetails) {
    // For refinances: netCashToBorrower is already calculated
    // Negative = cash required, Positive = cash back
    cashToClose = -refinanceDetails.netCashToBorrower; // Negative means cash to borrower (refund)
    totalFundsRequired = refinanceDetails.cashNeededAtClosing;
  } else {
    // Purchase: standard calculation
    totalFundsRequired = downPaymentAmount + netClosingCosts - totalDPAAmount;
    cashToClose = totalFundsRequired - earnestMoney;
  }

  const isDPAExcessive = totalDPAAmount > (downPaymentAmount + Math.max(0, netClosingCosts));
  
  // Calculate prepaid interest for results (for display purposes)
  // Note: prepaidInterestDays and prepaidInterest are already calculated above in the closing costs section
  const finalPrepaidInterestDays = scenario.settlementDate 
    ? prepaidInterestDays 
    : (scenario.closingCosts?.find(c => c.id === 'prepaid-interest')?.days || 0);
  const finalPrepaidInterest = scenario.settlementDate 
    ? prepaidInterest 
    : calculatePrepaidInterest(totalLoanAmount, interestRate, undefined, finalPrepaidInterestDays); 

  // 11. Total Monthly Payment Display
  const baseMonthlyPayment = monthlyPrincipalAndInterest + fixedMonthlyCosts;
  
  let totalMonthlyPayment = baseMonthlyPayment;
  if (scenario.buydown.active && buydownSchedule.length > 0) {
      const subsidy = buydownSchedule[0].subsidy;
      totalMonthlyPayment = baseMonthlyPayment - subsidy;
  }

  // 12. Ratios & Affordability Logic
  const income = scenario.income || { borrower1: 0, borrower2: 0, rental: 0, other: 0 };
  
  // Rental Income 75%
  const effectiveRentalIncome = safeNum(income.rental) * 0.75;
  
  // For DSCR loans, ignore borrower income and debts
  const totalIncome = scenario.isDSCRLoan 
    ? 0 // DSCR loans don't use borrower income for DTI
    : safeNum(income.borrower1) + safeNum(income.borrower2) + effectiveRentalIncome + safeNum(income.other);
  
  const debts = scenario.debts || { monthlyTotal: 0 };
  const totalMonthlyDebt = scenario.isDSCRLoan ? 0 : safeNum(debts.monthlyTotal); // DSCR loans ignore debts

  let frontEndDTI = 0;
  let backEndDTI = 0;

  // Only calculate DTI if not a DSCR loan
  if (!scenario.isDSCRLoan && totalIncome > 0) {
      // Use Note Rate Payment (baseMonthlyPayment) for qualification
      frontEndDTI = (baseMonthlyPayment / totalIncome) * 100;
      backEndDTI = ((baseMonthlyPayment + totalMonthlyDebt) / totalIncome) * 100;
  }

  // Reverse Affordability
  const calculateAffordability = (maxFrontEnd: number, maxBackEnd: number) => {
      if (totalIncome <= 0) return { maxHousingPayment: 0, maxPrice: 0, maxLoan: 0, math: [] };
      
      // Calculate Ceiling 1: Based on Front End Ratio
      const ceilingFront = totalIncome * (maxFrontEnd / 100);

      // Calculate Ceiling 2: Based on Back End Ratio
      const maxTotalDebt = totalIncome * (maxBackEnd / 100);
      const ceilingBack = Math.max(0, maxTotalDebt - totalMonthlyDebt);

      // Max housing payment is the LOWER of the two ceilings
      const maxHousingPayment = Math.min(ceilingFront, ceilingBack);
      const limitingFactor = ceilingFront < ceilingBack ? 'Front-End' : 'Back-End';
      
      // Approximation: Y = X * (MaxHousing / CurrentHousing)
      let maxPrice = 0;
      let maxLoan = 0;
      let ratio = 0;
      
      if (baseMonthlyPayment > 0 && purchasePrice > 0) {
          ratio = maxHousingPayment / baseMonthlyPayment;
          maxPrice = purchasePrice * ratio;
          // Assuming the same Down Payment % is used for the Max Scenario:
          maxLoan = maxPrice * (1 - (scenario.downPaymentPercent / 100));
      }

      const math = [
          `Total Income: $${totalIncome.toLocaleString()}`,
          `Max Housing Payment Logic:`,
          ` • Front-End Limit (${maxFrontEnd}%): $${ceilingFront.toLocaleString(undefined, {maximumFractionDigits:0})}`,
          ` • Back-End Limit (${maxBackEnd}%): $${(totalIncome * (maxBackEnd/100)).toLocaleString(undefined, {maximumFractionDigits:0})} - Debts ($${totalMonthlyDebt}) = $${ceilingBack.toLocaleString(undefined, {maximumFractionDigits:0})}`,
          ` • Limiting Factor: ${limitingFactor} (Lowest of above)`,
          ` • Result: $${maxHousingPayment.toLocaleString(undefined, {maximumFractionDigits:0})} / month`,
          `Max Price Logic (Ratio Method):`,
          ` • Current Pmt: $${baseMonthlyPayment.toLocaleString(undefined, {maximumFractionDigits:0})}`,
          ` • Ratio (Max / Current): ${ratio.toFixed(4)}`,
          ` • Max Price ($${purchasePrice.toLocaleString()} * ${ratio.toFixed(4)}): $${maxPrice.toLocaleString(undefined, {maximumFractionDigits:0})}`,
          ` • Max Loan ($${maxPrice.toLocaleString(undefined, {maximumFractionDigits:0})} - ${scenario.downPaymentPercent}% Down): $${maxLoan.toLocaleString(undefined, {maximumFractionDigits:0})}`
      ];

      return { maxHousingPayment, maxPrice, maxLoan, math };
  };

  // Only calculate affordability if not a DSCR loan
  const convAffordability = scenario.isDSCRLoan ? { maxHousingPayment: 0, maxPrice: 0, maxLoan: 0, math: [] } : calculateAffordability(46.99, 49.99); 
  const fhaAffordability = scenario.isDSCRLoan ? { maxHousingPayment: 0, maxPrice: 0, maxLoan: 0, math: [] } : calculateAffordability(46.99, 57.00);

  // Check current scenario fit (always false for DSCR loans since DTI is not applicable)
  const convPass = scenario.isDSCRLoan ? false : (frontEndDTI <= 46.99 && backEndDTI <= 49.99);
  const fhaPass = scenario.isDSCRLoan ? false : (frontEndDTI <= 46.99 && backEndDTI <= 57.00);

  return {
    baseLoanAmount,
    financedMIP,
    totalLoanAmount,
    monthlyPrincipalAndInterest,
    monthlyTax: propertyTaxYearly / 12,
    monthlyInsurance: homeInsuranceYearly / 12,
    monthlyMI,
    monthlyHOA: hoaMonthly,
    monthlyDPAPayment: dpaPayment,
    monthlyDPA2Payment: dpa2Payment,
    totalMonthlyPayment,
    baseMonthlyPayment,
    totalClosingCosts,
    buydownCost,
    downPaymentRequired: downPaymentAmount,
    earnestMoney,
    sellerConcessionsAmount: sellerConcessionsInput,
    sellerConcessionsPercent,
    isConcessionsExcessive,
    maxConcessionsAllowed,
    lenderCreditsAmount,
    cashToClose,
    prepaidInterest: finalPrepaidInterest,
    prepaidInterestDays: finalPrepaidInterestDays,
    buydownSchedule: scenario.buydown.active ? buydownSchedule : undefined,
    ltv,
    miRatePercent,
    dti: {
        frontEnd: frontEndDTI,
        backEnd: backEndDTI
    },
    affordability: {
        maxHousingPaymentConv: convAffordability.maxHousingPayment,
        maxPriceConv: convAffordability.maxPrice,
        maxLoanConv: convAffordability.maxLoan,
        maxHousingPaymentFHA: fhaAffordability.maxHousingPayment,
        maxPriceFHA: fhaAffordability.maxPrice,
        maxLoanFHA: fhaAffordability.maxLoan
    },
    // Extended Data for UI
    mathBreakdown: {
        conv: convAffordability.math,
        fha: fhaAffordability.math,
        convPass,
        fhaPass
    },
    warnings: {
        excessConcessions: isConcessionsExcessive || unusedSellerConcessions > 0, // Ensure warning shows if unused concessions exist
        excessDPA: isDPAExcessive
    },
    income: {
        effectiveRental: effectiveRentalIncome,
        total: totalIncome
    },
    netClosingCosts,
    unusedSellerConcessions,
    totalFundsRequired,
    
    // DSCR Calculation for Investment Properties
    dscr: scenario.occupancyType === 'Investment Property' ? (() => {
        const grossRentalIncome = safeNum(income.rental); // Monthly gross rental
        const debtService = baseMonthlyPayment; // Total monthly payment (P&I + Tax + Ins + MI + HOA + DPA)
        const dscrRatio = debtService > 0 ? grossRentalIncome / debtService : 0;
        
        return {
            ratio: dscrRatio,
            grossRentalIncome,
            debtService,
            passes: dscrRatio >= 1.0
        };
    })() : undefined,
    
    // Refinance-specific details (only populated for refinances)
    refinanceDetails
  };
};