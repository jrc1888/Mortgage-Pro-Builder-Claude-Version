import { LoanType, Scenario } from './types';

export const DEFAULT_CLOSING_COSTS = [
  // Lender Fees
  // Origination Fee Removed
  { id: 'discount-points', category: 'Lender Fees', name: 'Discount Points', amount: 0, isFixed: false }, // Default to % now
  { id: 'underwriting', category: 'Lender Fees', name: 'Underwriting Fee', amount: 995, isFixed: true },
  { id: 'processing', category: 'Lender Fees', name: 'Administration Fee', amount: 795, isFixed: true },
  { id: 'wire-transfer', category: 'Lender Fees', name: 'Wire Transfer Fee', amount: 23, isFixed: true },
  // Lender Credit Removed (Moved to top level)
  
  // Third Party
  { id: 'appraisal', category: 'Third Party Fees', name: 'Appraisal', amount: 650, isFixed: true },
  { id: 'credit-report', category: 'Third Party Fees', name: 'Credit Report', amount: 250, isFixed: true },
  { id: 'flood-cert', category: 'Third Party Fees', name: 'Flood Certification', amount: 15, isFixed: true },
  
  // Title / Gov
  { id: 'title-insurance', category: 'Title & Government', name: 'Title Insurance (Lender)', amount: 0.5, isFixed: false }, // Percentage of loan
  { id: 'recording', category: 'Title & Government', name: 'Recording Fees', amount: 150, isFixed: true },
  { id: 'settlement', category: 'Title & Government', name: 'Settlement / Closing Fee', amount: 500, isFixed: true },

  // Escrows & Prepaids
  { id: 'prepaid-interest', category: 'Escrows/Prepaids', name: 'Prepaid Interest', amount: 0, isFixed: true, days: 15 },
  { id: 'prepaid-insurance', category: 'Escrows/Prepaids', name: 'Homeowners Insurance Premium', amount: 0, isFixed: true, months: 12 },
  { id: 'tax-reserves', category: 'Escrows/Prepaids', name: 'Property Tax Reserves', amount: 0, isFixed: true, months: 3 },
  { id: 'insurance-reserves', category: 'Escrows/Prepaids', name: 'Homeowners Insurance Reserves', amount: 0, isFixed: true, months: 2 },

  // Other Fees
  { id: 'realtor-admin', category: 'Other Fees', name: 'Realtor Admin Fee', amount: 495, isFixed: true },
  { id: 'hoa-transfer', category: 'Other Fees', name: 'HOA Transfer Fee', amount: 0, isFixed: true },
  { id: 'hoa-prepay', category: 'Other Fees', name: 'HOA Monthly Dues (Prepay)', amount: 0, isFixed: true, months: 1 },
  { id: 'misc-1', category: 'Other Fees', name: 'Other Fee 1', amount: 0, isFixed: true },
  { id: 'misc-2', category: 'Other Fees', name: 'Other Fee 2', amount: 0, isFixed: true },
  { id: 'misc-3', category: 'Other Fees', name: 'Other Fee 3', amount: 0, isFixed: true },
  { id: 'misc-4', category: 'Other Fees', name: 'Other Fee 4', amount: 0, isFixed: true },
  { id: 'misc-5', category: 'Other Fees', name: 'Other Fee 5', amount: 0, isFixed: true },
];

export const DEFAULT_SCENARIO: Scenario = {
  id: '',
  name: 'New Scenario',
  clientName: '',
  propertyAddress: '',
  isAddressTBD: false,
  dateCreated: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  history: [], 
  preApprovals: [],
  
  purchasePrice: 500000,
  earnestMoney: 0,
  sellerConcessions: 0,
  showSellerConcessions: false,
  lenderCredits: 0,
  lenderCreditsMode: 'fixed',
  showLenderCredits: false,

  propertyTaxYearly: 3000, 
  homeInsuranceYearly: 1000,
  hoaMonthly: 0,
  
  loanType: LoanType.CONVENTIONAL,
  downPaymentAmount: 25000, // 5% of 500k
  downPaymentPercent: 5,
  interestRate: 6.5,
  loanTermMonths: 360,
  interestOnly: false,
  creditScore: 740,
  manualMI: null,
  
  ufmipRate: 0, // Will update based on loan type logic
  
  // Income & Debts
  income: {
    borrower1: 0,
    borrower2: 0,
    rental: 0,
    other: 0
  },
  debts: {
    monthlyTotal: 0
  },

  closingCosts: DEFAULT_CLOSING_COSTS,
  
  buydown: {
    active: false,
    type: '2-1',
    cost: 0
  },
  dpa: {
    active: false,
    amount: 10000,
    percent: 0,
    rate: 7.5,
    termMonths: 120, // 10 year
    payment: 0,
    isDeferred: false
  }
};