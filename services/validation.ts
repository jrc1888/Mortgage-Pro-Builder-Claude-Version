import { Scenario, CalculatedResults, LoanType } from '../types';

export interface LoanLimits {
  conventional: { conforming: number; highBalance: number };
  fha: { floor: number; ceiling: number };
  va: { noLimit: boolean };
  jumbo: { minimum: number };
}

export interface LTVRules {
  conventional: { minDownPayment: number; maxLTV: number; pmiRequired: number };
  fha: { minDownPayment: number; maxLTV: number };
  va: { minDownPayment: number; maxLTV: number };
  jumbo: { minDownPayment: number; maxLTV: number };
}

export interface ValidationThresholds {
  purchasePriceMin: number;
  interestRateMin: number;
  interestRateMax: number;
  dtiFrontEndWarning: number;
  dtiBackEndMax: number;
  creditScoreFhaMin: number;
  creditScoreConventionalMin: number;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export const DEFAULT_LOAN_LIMITS: LoanLimits = {
  conventional: {
    conforming: 766550, // 2024 limit
    highBalance: 1149825 // High-cost areas
  },
  fha: {
    floor: 498257,
    ceiling: 1149825
  },
  va: {
    noLimit: true
  },
  jumbo: {
    minimum: 766551
  }
};

export const DEFAULT_LTV_RULES: LTVRules = {
  conventional: {
    minDownPayment: 3,
    maxLTV: 97,
    pmiRequired: 80
  },
  fha: {
    minDownPayment: 3.5,
    maxLTV: 96.5
  },
  va: {
    minDownPayment: 0,
    maxLTV: 100
  },
  jumbo: {
    minDownPayment: 10,
    maxLTV: 90
  }
};

export const DEFAULT_VALIDATION_THRESHOLDS: ValidationThresholds = {
  purchasePriceMin: 50000,
  interestRateMin: 2,
  interestRateMax: 12,
  dtiFrontEndWarning: 43,
  dtiBackEndMax: 50,
  creditScoreFhaMin: 580,
  creditScoreConventionalMin: 620
};

export const validateScenario = (
  scenario: Scenario,
  results: CalculatedResults,
  loanLimits: LoanLimits = DEFAULT_LOAN_LIMITS,
  ltvRules: LTVRules = DEFAULT_LTV_RULES,
  thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Purchase Price Validation
  if (scenario.purchasePrice <= 0) {
    errors.push({
      field: 'purchasePrice',
      message: 'Purchase price must be greater than zero',
      severity: 'error'
    });
  }

  if (scenario.purchasePrice < thresholds.purchasePriceMin) {
    errors.push({
      field: 'purchasePrice',
      message: 'Purchase price seems unusually low',
      severity: 'warning'
    });
  }

  // Loan Type Specific Validations
  if (scenario.loanType === LoanType.CONVENTIONAL) {
    if (scenario.purchasePrice > loanLimits.conventional.conforming) {
      errors.push({
        field: 'loanType',
        message: `Exceeds conforming limit ($${loanLimits.conventional.conforming.toLocaleString()}). Consider Jumbo loan.`,
        severity: 'warning'
      });
    }
  }

  if (scenario.loanType === LoanType.FHA) {
    if (results.baseLoanAmount > loanLimits.fha.ceiling) {
      errors.push({
        field: 'purchasePrice',
        message: `Exceeds FHA loan limit ($${loanLimits.fha.ceiling.toLocaleString()})`,
        severity: 'error'
      });
    }
  }

  // LTV Validation
  const ltvRule = ltvRules[scenario.loanType.toLowerCase() as keyof LTVRules];
  if (ltvRule) {
    if (scenario.downPaymentPercent < ltvRule.minDownPayment) {
      errors.push({
        field: 'downPaymentPercent',
        message: `${scenario.loanType} requires minimum ${ltvRule.minDownPayment}% down payment`,
        severity: 'error'
      });
    }

    // For FHA loans, LTV validation uses baseLoanAmount (excluding UFMIP)
    // For other loan types, use the standard LTV (which includes UFMIP/funding fees)
    const ltvForValidation = scenario.loanType === LoanType.FHA
      ? (scenario.purchasePrice > 0 ? (results.baseLoanAmount / scenario.purchasePrice) * 100 : 0)
      : results.ltv;

    if (ltvForValidation > ltvRule.maxLTV) {
      errors.push({
        field: 'downPaymentPercent',
        message: `LTV (${ltvForValidation.toFixed(1)}%) exceeds maximum ${ltvRule.maxLTV}% for ${scenario.loanType}`,
        severity: 'error'
      });
    }
  }

  // DTI Validation - Skip if only rental income exists (no borrower income)
  const hasBorrowerIncome = (scenario.income?.borrower1 || 0) > 0 || 
                             (scenario.income?.borrower2 || 0) > 0 || 
                             (scenario.income?.other || 0) > 0;
  const hasRentalIncome = (scenario.income?.rental || 0) > 0;
  
  // Only validate DTI if there's borrower income (not rental-only qualification)
  if (hasBorrowerIncome || !hasRentalIncome) {
    if (results.dti.frontEnd > thresholds.dtiFrontEndWarning) {
      errors.push({
        field: 'income',
        message: `Front-end DTI (${results.dti.frontEnd.toFixed(1)}%) exceeds typical limit (${thresholds.dtiFrontEndWarning}%)`,
        severity: 'warning'
      });
    }

    if (results.dti.backEnd > thresholds.dtiBackEndMax) {
      errors.push({
        field: 'income',
        message: `Back-end DTI (${results.dti.backEnd.toFixed(1)}%) exceeds typical limit (${thresholds.dtiBackEndMax}%)`,
        severity: 'error'
      });
    }
  }

  // Credit Score Validation
  if (scenario.loanType === LoanType.FHA && scenario.creditScore < thresholds.creditScoreFhaMin) {
    errors.push({
      field: 'creditScore',
      message: `FHA requires minimum ${thresholds.creditScoreFhaMin} credit score`,
      severity: 'error'
    });
  }

  if (scenario.loanType === LoanType.CONVENTIONAL && scenario.creditScore < thresholds.creditScoreConventionalMin) {
    errors.push({
      field: 'creditScore',
      message: `Conventional loans typically require ${thresholds.creditScoreConventionalMin}+ credit score`,
      severity: 'warning'
    });
  }

  // Interest Rate Validation
  if (scenario.interestRate > thresholds.interestRateMax) {
    errors.push({
      field: 'interestRate',
      message: 'Interest rate seems unusually high. Please verify.',
      severity: 'warning'
    });
  }

  if (scenario.interestRate < thresholds.interestRateMin) {
    errors.push({
      field: 'interestRate',
      message: 'Interest rate seems unusually low. Please verify.',
      severity: 'warning'
    });
  }

  return errors;
};
