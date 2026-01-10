/**
 * APR Calculator Tests
 * Test cases based on the provided examples
 */

import { calculateAPR, explainAPR, APRInput } from '../index';

describe('APR Calculator', () => {
  describe('Example 1: Conventional 30yr fixed', () => {
    it('should calculate APR correctly with lender fees', () => {
      const input: APRInput = {
        loan_type: 'conv',
        structure: 'fixed',
        base_loan_amount: 475000,
        note_rate_initial: 0.065, // 6.50%
        term_months: 360,
        fees: [
          {
            name: 'Origination',
            amount: 4750, // 1.00% of 475000
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'origination'
          },
          {
            name: 'Underwriting',
            amount: 1250,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'underwriting'
          },
          {
            name: 'Appraisal',
            amount: 700,
            paid_to: 'third_party',
            paid_by: 'borrower_cash',
            required_for_credit: false,
            category: 'appraisal'
          },
          {
            name: 'Title',
            amount: 1800,
            paid_to: 'third_party',
            paid_by: 'borrower_cash',
            required_for_credit: false,
            category: 'title'
          }
        ]
      };

      const result = calculateAPR(input);

      // APR should be higher than note rate (6.50%)
      expect(result.apr_annual).toBeGreaterThan(6.50);
      
      // Net amount financed = 475000 - (4750 + 1250) = 469000
      expect(result.net_amount_financed).toBeCloseTo(469000, 0);
      
      // Note amount = base loan (no financed fees)
      expect(result.note_amount).toBe(475000);
      
      // Total finance charges = 4750 + 1250 = 6000
      expect(result.total_finance_charges).toBeCloseTo(6000, 0);
      
      // Solver should converge
      expect(result.debug_breakdown.solver_converged).toBe(true);
    });
  });

  describe('Example 2: FHA 30yr fixed with financed UFMIP', () => {
    it('should calculate APR with financed UFMIP', () => {
      const ufmipAmount = 475000 * 0.0175; // 8312.50

      const input: APRInput = {
        loan_type: 'fha',
        structure: 'fixed',
        base_loan_amount: 475000,
        note_rate_initial: 0.065, // 6.50%
        term_months: 360,
        financed_upfront_fees: [
          {
            name: 'UFMIP',
            amount: ufmipAmount,
            is_finance_charge: true
          }
        ],
        fees: [
          {
            name: 'Origination',
            amount: 4750,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'origination'
          },
          {
            name: 'Underwriting',
            amount: 1250,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'underwriting'
          }
        ]
      };

      const result = calculateAPR(input);

      // Note amount = base loan + UFMIP
      expect(result.note_amount).toBeCloseTo(475000 + ufmipAmount, 0);
      
      // Net amount financed = 475000 - (4750 + 1250 + 8312.50) = 460687.50
      expect(result.net_amount_financed).toBeCloseTo(460687.50, 0);
      
      // APR should be materially higher than conventional (Example 1)
      expect(result.apr_annual).toBeGreaterThan(6.50);
      
      // Total finance charges = 6000 + 8312.50 = 14312.50
      expect(result.total_finance_charges).toBeCloseTo(14312.50, 0);
    });
  });

  describe('Example 3: VA 30yr fixed with financed funding fee', () => {
    it('should calculate APR with VA funding fee', () => {
      const fundingFeeAmount = 450000 * 0.0215; // 9675

      const input: APRInput = {
        loan_type: 'va',
        structure: 'fixed',
        base_loan_amount: 450000,
        note_rate_initial: 0.0625, // 6.25%
        term_months: 360,
        financed_upfront_fees: [
          {
            name: 'VA Funding Fee',
            amount: fundingFeeAmount,
            is_finance_charge: true
          }
        ],
        fees: [
          {
            name: 'Origination',
            amount: 3375, // 0.75% of 450000
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'origination'
          },
          {
            name: 'Processing',
            amount: 900,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'processing'
          }
        ]
      };

      const result = calculateAPR(input);

      // Note amount = base loan + funding fee
      expect(result.note_amount).toBeCloseTo(450000 + fundingFeeAmount, 0);
      
      // Net amount financed = 450000 - (3375 + 900 + 9675) = 436050
      expect(result.net_amount_financed).toBeCloseTo(436050, 0);
      
      // APR should be higher than note rate (6.25%)
      expect(result.apr_annual).toBeGreaterThan(6.25);
      
      // Total finance charges = 3375 + 900 + 9675 = 13950
      expect(result.total_finance_charges).toBeCloseTo(13950, 0);
    });
  });

  describe('Example 4: ARM 5/1, 30yr amortizing', () => {
    it('should calculate APR for ARM with constant index assumption', () => {
      const input: APRInput = {
        loan_type: 'conv',
        structure: 'arm',
        base_loan_amount: 400000,
        note_rate_initial: 0.06, // 6.00%
        term_months: 360,
        arm_params: {
          initial_fixed_months: 60,
          margin: 0.0225, // 2.25%
          index_initial: 0.035, // 3.50%
          periodic_cap: 0.02, // 2.00%
          lifetime_cap: 0.05, // 5.00%
          lifetime_floor: 0.025, // 2.50%
          adjust_freq_months: 12,
          use_constant_index: true // Mode 1
        },
        fees: [
          {
            name: 'Origination',
            amount: 4000,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'origination'
          },
          {
            name: 'Appraisal',
            amount: 650,
            paid_to: 'third_party',
            paid_by: 'borrower_cash',
            required_for_credit: false,
            category: 'appraisal'
          }
        ]
      };

      const result = calculateAPR(input);

      // APR should be calculated from schedule including adjustments
      expect(result.apr_annual).toBeGreaterThan(0);
      expect(result.apr_annual).toBeLessThan(20); // Reasonable upper bound
      
      // Should have adjustment events in schedule
      const adjustments = result.payment_schedule.filter(p => p.is_adjustment);
      expect(adjustments.length).toBeGreaterThan(0);
      
      // First adjustment should be at period 61 (after 60-month fixed)
      const firstAdjustment = adjustments[0];
      expect(firstAdjustment.period).toBe(61);
    });
  });

  describe('Example 5: Interest-only then amortizing (fixed)', () => {
    it('should calculate APR for IO loan', () => {
      const input: APRInput = {
        loan_type: 'conv',
        structure: 'io',
        base_loan_amount: 600000,
        note_rate_initial: 0.0675, // 6.75%
        term_months: 360,
        io_months: 120, // 10 years IO
        fees: [
          {
            name: 'Points',
            amount: 6000, // 1.00% of 600000
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'points'
          },
          {
            name: 'Underwriting',
            amount: 1500,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'underwriting'
          }
        ]
      };

      const result = calculateAPR(input);

      // APR should be higher than note rate (6.75%)
      expect(result.apr_annual).toBeGreaterThan(6.75);
      
      // Should have IO period in schedule
      const ioPayments = result.payment_schedule.filter(p => p.is_io_period);
      expect(ioPayments.length).toBe(120);
      
      // IO payments should have zero principal
      ioPayments.forEach(p => {
        expect(p.principal).toBe(0);
      });
      
      // After IO period, should have amortizing payments
      const amortizingPayments = result.payment_schedule.slice(120);
      expect(amortizingPayments.length).toBe(240);
      amortizingPayments.forEach(p => {
        expect(p.principal).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle zero finance charges (APR = note rate)', () => {
      const input: APRInput = {
        loan_type: 'conv',
        structure: 'fixed',
        base_loan_amount: 400000,
        note_rate_initial: 0.065,
        term_months: 360,
        fees: [
          {
            name: 'Appraisal',
            amount: 700,
            paid_to: 'third_party',
            paid_by: 'borrower_cash',
            required_for_credit: false,
            category: 'appraisal'
          }
        ]
      };

      const result = calculateAPR(input);

      // With no finance charges, APR should be very close to note rate
      expect(result.apr_annual).toBeCloseTo(6.5, 1);
      expect(result.net_amount_financed).toBe(400000);
    });

    it('should handle lender credits', () => {
      const input: APRInput = {
        loan_type: 'conv',
        structure: 'fixed',
        base_loan_amount: 400000,
        note_rate_initial: 0.065,
        term_months: 360,
        fees: [
          {
            name: 'Origination',
            amount: 4000,
            paid_to: 'lender',
            paid_by: 'borrower_cash',
            required_for_credit: true,
            category: 'origination'
          }
        ],
        credits: {
          lender_credit: 2000 // Reduces finance charges
        }
      };

      const result = calculateAPR(input);

      // Net finance charges = 4000 - 2000 = 2000
      expect(result.total_finance_charges).toBeCloseTo(2000, 0);
      expect(result.net_amount_financed).toBeCloseTo(398000, 0);
      
      // APR should be lower than without credit
      const resultNoCredit = calculateAPR({
        ...input,
        credits: undefined
      });
      expect(result.apr_annual).toBeLessThan(resultNoCredit.apr_annual);
    });
  });
});





