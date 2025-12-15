

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
  
  // Transaction Type
  transactionType: 'Purchase' | 'Refinance';
  
  // Property Identity
  propertyAddress: string;
  isAddressTBD: boolean;
  contractDate?: string; // ISO date string - only relevant if address is not TBD
  faDate?: string; // Funding & Approval date - only relevant if address is not TBD
  
  // Metadata
  dateCreated: string;
  lastUpdated: string;
  history: HistoryEntry[];
  preApprovals: PreApproval[]; // New field
  
  // Property Financials
  purchasePrice: number;
  earnestMoney: number;
  sellerConcessions: number; // New field ($ amount)
  showSellerConcessions: boolean; // UI Toggle
  lenderCredits: number; // New top-level field
  lenderCreditsMode: 'fixed' | 'percent'; 
  showLenderCredits: boolean; // UI Toggle
  
  propertyTaxYearly: number;
  homeInsuranceYearly: number;
  hoaMonthly: number;

  // Loan Logic
  loanType: LoanType;
  occupancyType: 'Primary Residence' | 'Second Home' | 'Investment Property';
  numberOfUnits: 1 | 2 | 3 | 4;
  downPaymentAmount: number;
  downPaymentPercent: number; // 20 means 20%
  interestRate: number;
  loanTermMonths: number;
  interestOnly: boolean; // New field
  
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
  unusedCredits: number; // New field: Amount of credit wasted if > costs
  totalFundsRequired: number;
}