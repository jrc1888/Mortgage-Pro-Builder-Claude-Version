import { LoanType, Scenario } from './types';

export const DEFAULT_CLOSING_COSTS = [
  // A. Origination Charges
  { id: 'discount-points', category: 'A. Origination Charges', name: '% of Loan Amount (Points)', amount: 0, isFixed: false },
  { id: 'processing', category: 'A. Origination Charges', name: 'Administration Fee', amount: 795, isFixed: true },
  { id: 'tax-service', category: 'A. Origination Charges', name: 'Tax Service Fee', amount: 71, isFixed: true },
  { id: 'underwriting', category: 'A. Origination Charges', name: 'Underwriting Fee', amount: 995, isFixed: true },
  { id: 'wire-transfer', category: 'A. Origination Charges', name: 'Wire Transfer Fee', amount: 23, isFixed: true },
  
  // B. Services You Cannot Shop For
  { id: 'appraisal', category: 'B. Services You Cannot Shop For', name: 'Appraisal Fee', amount: 650, isFixed: true },
  { id: 'credit-report', category: 'B. Services You Cannot Shop For', name: 'Credit Report Fee', amount: 250, isFixed: true },
  { id: 'flood-cert', category: 'B. Services You Cannot Shop For', name: 'Flood Certificate Fee', amount: 9, isFixed: true },
  
  // C. Services You Can Shop For
  { id: 'closing-protection-letter', category: 'C. Services You Can Shop For', name: 'Title - Closing Protection Ltr Fee', amount: 25, isFixed: true },
  { id: 'endorsement-fee', category: 'C. Services You Can Shop For', name: 'Title - Endorsement Fee', amount: 55, isFixed: true },
  { id: 'e-recording-fee', category: 'C. Services You Can Shop For', name: 'Title - eRecording Fee', amount: 10, isFixed: true },
  { id: 'title-insurance', category: 'C. Services You Can Shop For', name: 'Title - Lender\'s Title Insurance', amount: 0, isFixed: true },
  { id: 'settlement-fee', category: 'C. Services You Can Shop For', name: 'Title - Settlement Fee', amount: 395, isFixed: true },

  // E. Taxes and Other Government Fees
  { id: 'recording-fee', category: 'E. Taxes and Other Government Fees', name: 'Recording Fees and Other Taxes', amount: 80, isFixed: true },

  // F. Prepaids
  { id: 'prepaid-insurance', category: 'F. Prepaids', name: 'Homeowner\'s Insurance Premium', amount: 0, isFixed: true, months: 12 },
  { id: 'prepaid-interest', category: 'F. Prepaids', name: 'Prepaid Interest', amount: 0, isFixed: true, days: 15 },
  { id: 'tax-reserves', category: 'F. Prepaids', name: 'Property Taxes', amount: 0, isFixed: true, months: 3 },

  // G. Initial Escrow Payment at Closing
  { id: 'insurance-reserves', category: 'G. Initial Escrow Payment at Closing', name: 'Homeowner\'s Insurance', amount: 0, isFixed: true, months: 2 },

  // H. Other
  { id: 'realtor-admin', category: 'H. Other', name: 'Realtor Administration Fee', amount: 495, isFixed: true },
  { id: 'buyers-agent-commission', category: 'H. Other', name: 'Realtor Commission Buyer', amount: 0, isFixed: false },
  { id: 'hoa-transfer', category: 'H. Other', name: 'HOA Transfer Fee', amount: 0, isFixed: true },
  { id: 'hoa-prepay', category: 'H. Other', name: 'HOA Monthly Dues (Prepay)', amount: 0, isFixed: true, months: 1 },
  { id: 'misc-1', category: 'H. Other', name: 'Other Fee 1', amount: 0, isFixed: true },
  { id: 'misc-2', category: 'H. Other', name: 'Other Fee 2', amount: 0, isFixed: true },
  { id: 'misc-3', category: 'H. Other', name: 'Other Fee 3', amount: 0, isFixed: true },
  { id: 'misc-4', category: 'H. Other', name: 'Other Fee 4', amount: 0, isFixed: true },
];

export const DEFAULT_SCENARIO: Scenario = {
  id: '',
  name: 'New Scenario',
  clientName: '',
  transactionType: 'Purchase',
  propertyAddress: '',
  isAddressTBD: false,
  faDate: undefined,
  settlementDate: undefined,
  dateCreated: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  history: [], 
  preApprovals: [],
  isPinned: false,
  
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
  occupancyType: 'Primary Residence',
  numberOfUnits: 1,
  downPaymentAmount: 25000, // 5% of 500k
  downPaymentPercent: 5,
  interestRate: 6.5,
  loanTermMonths: 360,
  interestOnly: false,
  isDSCRLoan: false,
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
  
  notes: '',
  
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