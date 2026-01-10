/**
 * APR Calculation Models
 * Reg Z / TILA compliant data structures for mortgage APR calculation
 */

export type LoanType = 'conv' | 'fha' | 'va' | 'jumbo' | 'usda';
export type LoanStructure = 'fixed' | 'arm' | 'io' | 'io_arm';
export type PaymentFrequency = 'monthly';

export type PaidTo = 'lender' | 'broker' | 'third_party' | 'government' | 'investor';
export type PaidBy = 'borrower_cash' | 'seller_credit' | 'lender_credit' | 'financed';
export type FeeCategory = 
  | 'origination' 
  | 'points' 
  | 'underwriting' 
  | 'processing' 
  | 'title' 
  | 'appraisal' 
  | 'recording' 
  | 'transfer_tax' 
  | 'prepaid_interest' 
  | 'taxes_insurance' 
  | 'MI_upfront' 
  | 'MI_monthly' 
  | 'VA_funding_fee'
  | 'other';

export interface Fee {
  name: string;
  amount: number;
  paid_to: PaidTo;
  paid_by: PaidBy;
  required_for_credit: boolean;
  category: FeeCategory;
  notes?: string;
}

export interface ARMParams {
  initial_fixed_months: number;
  margin: number;
  index_initial: number; // Annual rate as decimal (e.g., 0.035 for 3.5%)
  periodic_cap: number; // Annual rate cap per adjustment (e.g., 0.02 for 2%)
  lifetime_cap: number; // Maximum rate above initial (e.g., 0.05 for 5%)
  lifetime_floor?: number; // Minimum rate (e.g., 0.025 for 2.5%)
  adjust_freq_months: number; // How often rate adjusts (e.g., 12 for annual)
  index_curve?: number[]; // Optional: future index values (Mode 2)
  use_constant_index?: boolean; // Mode 1: assume index stays at initial (default true)
}

export interface FinancedUpfrontFee {
  name: string;
  amount: number;
  is_finance_charge: boolean; // For APR purposes (UFMIP and VA funding fee are finance charges)
}

export interface APRInput {
  loan_type: LoanType;
  structure: LoanStructure;
  base_loan_amount: number;
  note_rate_initial: number; // Annual rate as decimal (e.g., 0.065 for 6.5%)
  term_months: number;
  io_months?: number; // Interest-only period in months
  arm_params?: ARMParams;
  financed_upfront_fees?: FinancedUpfrontFee[];
  fees: Fee[];
  credits?: {
    lender_credit?: number;
    seller_credit?: number;
  };
  payment_frequency?: PaymentFrequency; // Default: monthly
}

export interface PaymentScheduleEntry {
  period: number; // Month number (1-based)
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  note_rate: number; // Rate for this period
  is_adjustment?: boolean; // True if rate adjusted this period
  is_io_period?: boolean; // True if interest-only
}

export interface FeeClassification {
  fee: Fee;
  is_finance_charge: boolean;
  is_amount_financed_adjustment: boolean;
  explanation: string;
}

export interface APRResult {
  apr_annual: number; // APR as annual percentage (e.g., 6.75 for 6.75%)
  note_amount: number;
  net_amount_financed: number;
  total_finance_charges: number;
  payment_schedule: PaymentScheduleEntry[];
  payment_schedule_summary: PaymentScheduleEntry[]; // First 12 + adjustment events
  fee_classifications: FeeClassification[];
  debug_breakdown: {
    base_loan_amount: number;
    financed_upfront_fees_total: number;
    finance_charges_cash: number;
    finance_charges_financed: number;
    credits_applied: number;
    solver_iterations?: number;
    solver_converged: boolean;
  };
}





