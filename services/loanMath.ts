

import { Scenario, CalculatedResults, LoanType } from '../types';
import { calculateItemCost } from '../utils/closingCosts';

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
  const interestRate = safeNum(scenario.interestRate);
  const loanTermMonths = safeNum(scenario.loanTermMonths) || 360;
  const propertyTaxYearly = safeNum(scenario.propertyTaxYearly);
  const homeInsuranceYearly = safeNum(scenario.homeInsuranceYearly);
  const hoaMonthly = safeNum(scenario.hoaMonthly);
  const earnestMoney = safeNum(scenario.earnestMoney);
  
  // Logic Update: Only calculate credits if toggled ON.
  // The raw values remain in the scenario object for persistence, but we treat them as 0 for math if hidden.
  const sellerConcessionsInput = scenario.showSellerConcessions ? safeNum(scenario.sellerConcessions) : 0;

  // 1. Base Numbers
  let baseLoanAmount = purchasePrice - downPaymentAmount;
  
  // 2. Upfront MIP / Funding Fee Logic
  let ufmipRate = 0;
  if (scenario.loanType === LoanType.FHA) {
    ufmipRate = 0.0175; // 1.75% standard
  } else if (scenario.loanType === LoanType.VA) {
    ufmipRate = scenario.ufmipRate > 0 ? scenario.ufmipRate / 100 : 0.0215; 
  }
  
  const financedMIP = (scenario.loanType === LoanType.FHA || scenario.loanType === LoanType.VA) 
    ? baseLoanAmount * ufmipRate 
    : 0;

  const totalLoanAmount = baseLoanAmount + financedMIP;
  const ltv = purchasePrice > 0 ? (baseLoanAmount / purchasePrice) * 100 : 0;

  // 3. Monthly P&I
  const monthlyRate = (interestRate / 100) / 12;
  let monthlyPrincipalAndInterest = 0;

  if (scenario.interestOnly && (scenario.loanType === LoanType.CONVENTIONAL || scenario.loanType === LoanType.JUMBO)) {
    // Interest Only Calculation: Loan Amount * Annual Rate / 12
    monthlyPrincipalAndInterest = totalLoanAmount * monthlyRate;
  } else {
    // Standard Amortization
    monthlyPrincipalAndInterest = calculatePMT(monthlyRate, loanTermMonths, totalLoanAmount);
  }

  // 4. Monthly MI
  let monthlyMI = 0;
  let miRatePercent = 0;

  if (scenario.manualMI !== null && scenario.manualMI !== undefined) {
    monthlyMI = safeNum(scenario.manualMI);
    // Reverse calculate the % for display if manual
    miRatePercent = totalLoanAmount > 0 ? (monthlyMI * 12 / totalLoanAmount) * 100 : 0;
  } else {
    if (scenario.loanType === LoanType.FHA) {
      // FHA Rules (Annual):
      const factor = ltv > 95 ? 0.0055 : 0.0050; 
      miRatePercent = factor * 100;
      monthlyMI = (totalLoanAmount * factor) / 12;
    } else if (scenario.loanType === LoanType.CONVENTIONAL && ltv > 80) {
      // Standard Conventional Logic (Simplified)
      let factor = 0;
      if (ltv > 95) factor = 0.0095;
      else if (ltv > 90) factor = 0.0075;
      else if (ltv > 85) factor = 0.0048;
      else factor = 0.0028;

      miRatePercent = factor * 100;
      monthlyMI = (totalLoanAmount * factor) / 12;
    }
  }

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
  const fixedMonthlyCosts = (propertyTaxYearly / 12) + (homeInsuranceYearly / 12) + monthlyMI + hoaMonthly + dpaPayment + dpa2Payment;

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
  const prepaidInterestDays = calculatePrepaidInterestDays(scenario.settlementDate);
  const prepaidInterest = scenario.settlementDate 
    ? calculatePrepaidInterest(totalLoanAmount, interestRate, scenario.settlementDate)
    : 0;
  
  // Use utility function to calculate closing costs (single source of truth)
  const totalClosingCosts = (scenario.closingCosts || []).reduce((sum, item) => {
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
        prepaidInterestDays
      }
    );
    return sum + itemCost;
  }, 0) + buydownCost;
  
  // 8. Seller Concessions & Lender Credits Logic
  const sellerConcessionsPercent = purchasePrice > 0 ? (sellerConcessionsInput / purchasePrice) * 100 : 0;
  
  // Lender Credits
  const lenderCreditsVal = scenario.showLenderCredits ? safeNum(scenario.lenderCredits) : 0;
  let lenderCreditsAmount = 0;
  
  if (scenario.lenderCreditsMode === 'percent') {
      lenderCreditsAmount = totalLoanAmount * (lenderCreditsVal / 100);
  } else {
      lenderCreditsAmount = lenderCreditsVal;
  }
  
  // Determine Max Allowed % based on Guidelines
  let maxConcessionsPercent = 0;
  if (scenario.loanType === LoanType.FHA) maxConcessionsPercent = 6;
  else if (scenario.loanType === LoanType.VA) maxConcessionsPercent = 4;
  else if (scenario.loanType === LoanType.CONVENTIONAL) {
      if (ltv > 90) maxConcessionsPercent = 3;
      else if (ltv > 75) maxConcessionsPercent = 6;
      else maxConcessionsPercent = 9;
  } else {
      maxConcessionsPercent = 0; // Jumbo varies
  }
  
  const maxConcessionsAllowed = purchasePrice * (maxConcessionsPercent / 100);

  // Warnings
  const totalCredits = lenderCreditsAmount + sellerConcessionsInput;
  const isConcessionsExcessive = totalCredits > totalClosingCosts;

  // 9. Net Closing Costs (Costs - Credits)
  const rawNetClosingCosts = totalClosingCosts - totalCredits;
  const netClosingCosts = Math.max(0, rawNetClosingCosts);
  const unusedCredits = rawNetClosingCosts < 0 ? Math.abs(rawNetClosingCosts) : 0;

  // 10. Cash / Funds Required
  const dpaAmount = scenario.dpa.active ? safeNum(scenario.dpa.amount) : 0;
  const dpa2Amount = scenario.dpa2?.active ? safeNum(scenario.dpa2.amount) : 0;
  const totalDPAAmount = dpaAmount + dpa2Amount;
  
  // 10. Cash / Funds Required
  // Note: Prepaid interest is already included in netClosingCosts when settlement date exists
  // Logic: Total funds required = down + net closing costs - dpa - dpa2
  const totalFundsRequired = downPaymentAmount + netClosingCosts - totalDPAAmount;
  
  // Cash To Close = Funds Required - Earnest
  const cashToClose = totalFundsRequired - earnestMoney;

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
        excessConcessions: isConcessionsExcessive,
        excessDPA: isDPAExcessive
    },
    income: {
        effectiveRental: effectiveRentalIncome,
        total: totalIncome
    },
    netClosingCosts,
    unusedCredits,
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
    })() : undefined
  };
};