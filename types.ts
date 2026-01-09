

export enum LoanType {
  CONVENTIONAL = 'Conventional',
  FHA = 'FHA',
  VA = 'VA',
  JUMBO = 'Jumbo'
}

export interface BuydownConfig {
  active: boolean;
  type: '2-1' | '1-0' | '1-1' | '3-2-1';
  cost: number; // The calculated subsidy cost
}

export interface DPAConfig {
  active: boolean;
  amount: number;
  percent?: number; // New field for UI binding
  rate: number;
  termMonths: number;
  payment: number;
  isDeferred: boolean;
}

export interface ClosingCostItem {
  id: string;
  category?: string; // Grouping (Lender, Title, Escrows, etc)
  name: string;
  amount: number;
  isFixed: boolean; // if true, amount is $ value. if false, amount is % of Loan Amount.
  days?: number; // Optional field specifically for prepaid interest
  months?: number; // Optional field for reserves (tax/insurance)
}

export interface PreApproval {
  id: string;
  dateCreated: string;
  validUntil: string;
  loanOfficer: {
    name: string;
    nmls: string;
    phone: string;
    email: string;
  };
  snapshot: {
    purchasePrice: number;
    loanAmount: number;
    downPaymentPercent: number;
    loanType: string;
    clientName: string;
  };
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  note: string;
  changes: string[]; // List of text descriptions of what changed
  snapshot: Scenario; // The full state at this point
}

export interface IncomeConfig {
  borrower1: number;
  borrower2: number;
  rental: number; // Subject property rental/ADU
  other: number;
}

export interface DebtConfig {
  monthlyTotal: number;
}

// Subset of Scenario for User Defaults
export interface ScenarioDefaults {
  purchasePrice: number;
  downPaymentPercent: number;
  interestRate: number;
  loanTermMonths: number;
  propertyTaxYearly: number;
  homeInsuranceYearly: number;
  hoaMonthly: number;
  loanType: LoanType;
  creditScore: number;
  systemPin?: string; // New: OS Login PIN
  
  // Validation Thresholds
  validationThresholds?: {
    purchasePriceMin: number;
    interestRateMin: number;
    interestRateMax: number;
    dtiFrontEndWarning: number;
    dtiBackEndMax: number;
    creditScoreFhaMin: number;
    creditScoreConventionalMin: number;
  };
}

export interface Scenario {
  id: string;
  name: string;
  clientName: string;
  
  // Transaction Type (scenarioType is the new field, transactionType kept for backward compatibility)
  scenarioType?: 'purchase' | 'refinance'; // New field - preferred
  transactionType: 'Purchase' | 'Refinance'; // Legacy field - kept for backward compatibility
  
  // Property Identity
  propertyAddress: string;
  isAddressTBD: boolean;
  faDate?: string; // Funding & Approval date - only relevant if address is not TBD
  settlementDate?: string; // Settlement/Closing date - only relevant if address is not TBD
  
  // Metadata
  dateCreated: string;
  lastUpdated: string;
  history: HistoryEntry[];
  preApprovals: PreApproval[]; // New field
  isPinned?: boolean; // Pinned scenarios appear first in client folder
  
  // Property Financials
  purchasePrice: number; // For purchases; for refinances, this represents property/appraised value
  earnestMoney: number;
  sellerConcessions: number; // New field ($ amount)
  sellerConcessionsMode: 'fixed' | 'percent'; // Toggle between dollar and percentage
  showSellerConcessions: boolean; // UI Toggle
  lenderCredits: number; // New top-level field
  lenderCreditsMode: 'fixed' | 'percent'; 
  showLenderCredits: boolean; // UI Toggle
  
  propertyTaxYearly: number;
  homeInsuranceYearly: number;
  hoaMonthly: number;
  
  // Refinance-specific fields
  refinanceType?: 'rate_and_term' | 'cash_out'; // Only applicable when transactionType === 'Refinance'
  refinanceLoanAmount?: number; // Manual loan amount input for refinances (works backwards to calculate cash out/needed)
  existingLoanPayoff?: number; // First mortgage payoff amount
  secondMortgagePayoff?: number; // Second mortgage payoff amount (if applicable)
  cashOutAmount?: number; // Desired cash out amount (only for cash_out refi)
  cashOutCalculationMode?: 'specified' | 'maximum'; // How cash out is determined
  financeClosingCosts?: boolean; // Whether to finance closing costs in loan (default: true for refis)
  cashOutRateAdjustment?: number; // Additional rate for cash-out refi (default: 0.25-0.50%, user customizable)
  
  // Current loan information for refinance analysis (only for refinance scenarios)
  currentLoan?: {
    originalAmount: number;
    originalRate: number;
    fundingDate: string; // ISO date string
    originalTerm: number; // Loan term in months (e.g., 360 for 30-year)
    currentMonthlyPayment?: number; // Optional override for monthly P&I payment
    newLoanPaymentOverride?: number; // Optional override for new loan monthly P&I payment (PI only)
    useManualOverride?: boolean; // Checkbox to toggle between original loan info and manual override
    manualOverride?: {
      interestRate?: number;
      estimatedBalance?: number;
      estimatedPIPayment?: number;
      estimatedTotalPayment?: number;
    };
    originalPaymentBreakdown?: {
      monthlyTax?: number;
      monthlyInsurance?: number;
      monthlyMI?: number;
      hoaMonthly?: number;
      monthlyDPA?: number;
    };
  };

  // Loan Logic
  loanType: LoanType;
  occupancyType: 'Primary Residence' | 'Second Home' | 'Investment Property';
  numberOfUnits: 1 | 2 | 3 | 4;
  downPaymentAmount: number;
  downPaymentPercent: number; // 20 means 20%
  interestRate: number;
  loanTermMonths: number;
  interestOnly: boolean; // New field
  ioTermMonths: number; // Interest-only period in months (default 120)
  piTermMonths: number; // Principal & Interest repayment period in months (default matches loanTermMonths)
  armLoan: boolean; // Adjustable Rate Mortgage
  isDSCRLoan: boolean; // DSCR-only loan (ignores borrower income/debt, only uses rental income)
  
  // Specifics
  creditScore: number; // Affects MI
  manualMI: number | null; // Override monthly MI
  
  // FHA/VA specific
  ufmipRate: number; // 1.75 for FHA, varies for VA
  
  // Income & Debts (New Tab)
  income: IncomeConfig;
  debts: DebtConfig;

  // Costs
  closingCosts: ClosingCostItem[];
  showInterestCredit?: boolean; // Interest credit option for prepaid interest (reduces closing costs, doesn't skip payment)
  
  // Notes
  notes: string;
  
  // Advanced Features
  buydown: BuydownConfig;
  dpa: DPAConfig;
  dpa2?: DPAConfig; // Second DPA option
}

export interface CalculatedResults {
  baseLoanAmount: number;
  financedMIP: number; // UFMIP or VA Funding Fee
  totalLoanAmount: number;
  
  monthlyPrincipalAndInterest: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyMI: number;
  monthlyHOA: number;
  monthlyDPAPayment: number;
  monthlyDPA2Payment: number;
  
  totalMonthlyPayment: number; // Standard full payment (or Year 1 if buydown active)
  baseMonthlyPayment: number; // The note rate payment (for comparison)
  
  totalClosingCosts: number;
  buydownCost: number; // Explicitly separated
  downPaymentRequired: number;
  earnestMoney: number;
  
  sellerConcessionsAmount: number;
  sellerConcessionsPercent: number;
  isConcessionsExcessive: boolean; // Flag if concessions > closing costs
  maxConcessionsAllowed: number; // Based on guidelines

  lenderCreditsAmount: number; // Calculated amount

  cashToClose: number; // Total needed at table
  prepaidInterest: number; // Prepaid interest from settlement to end of month
  prepaidInterestDays: number; // Number of days of prepaid interest

  // Metadata for UI
  ltv: number;
  miRatePercent: number; // The annual % used for calculation

  buydownSchedule?: {
    year: number;
    rate: number;
    payment: number;
    subsidy: number;
    fullPayment: number; // Includes Tax, Ins, MI, HOA, DPA
  }[];

  // Ratios & Affordability
  dti: {
    frontEnd: number;
    backEnd: number;
  };
  affordability: {
    maxHousingPaymentConv: number;
    maxPriceConv: number;
    maxLoanConv: number;
    maxHousingPaymentFHA: number;
    maxPriceFHA: number;
    maxLoanFHA: number;
  };

  // Extended UI Data
  mathBreakdown: {
    conv: string[];
    fha: string[];
    convPass: boolean;
    fhaPass: boolean;
  };
  warnings: {
    excessConcessions: boolean;
    excessDPA: boolean;
  };
  income: {
    effectiveRental: number;
    total: number;
  };
  netClosingCosts: number;
  unusedSellerConcessions: number; // Amount of unused seller concessions (when concessions exceed non-financed closing costs)
  totalFundsRequired: number;
  
  // Investment Property Metrics
  dscr?: {
    ratio: number;
    grossRentalIncome: number;
    debtService: number;
    passes: boolean; // true if >= 1.0
  };
  
  // Refinance-specific results (only populated for refinances)
  refinanceDetails?: {
    propertyValue: number;
    existingLoanPayoff: number; // First mortgage
    secondMortgagePayoff: number; // Second mortgage (if applicable)
    totalPayoff: number; // Sum of first + second
    cashOutRequested: number; // Original requested cash out
    cashOutAmount: number; // Actual cash out (may be reduced)
    cashOutReduced: boolean; // Flag if cash out was reduced due to LTV
    maxCashOutAvailable: number; // Maximum cash out available
    financedClosingCosts: number; // Amount of closing costs financed
    netCashToBorrower: number; // Cash out - any cash needed at closing (can be negative)
    cashNeededAtClosing: number; // If negative netCashToBorrower, this is the amount needed
    maxLoanAmount: number; // Maximum loan amount based on LTV
    baseLoanAmountBeforeUFMIP: number; // Base loan before UFMIP (for LTV calculation)
    useManualLoanAmount?: boolean; // Flag indicating loan amount was manually entered (work backwards)
  };
}