/**
 * APR Calculator - Main Entry Point
 * Reg Z / TILA compliant mortgage APR calculation
 */

import { APRInput, APRResult, FeeClassification, FinancedUpfrontFee } from './models';
import { FeeClassifier } from './feeClassifier';
import { PaymentScheduleGenerator } from './paymentSchedule';
import { APRSolver } from './aprSolver';

export class APRCalculator {
  /**
   * Calculate APR for a mortgage loan
   */
  static calculate(input: APRInput): APRResult {
    // Step 1: Classify all fees
    const allFees = [...input.fees];
    
    // Process credits as negative fees
    if (input.credits) {
      const creditFees = FeeClassifier.processCredits(
        input.credits.lender_credit,
        input.credits.seller_credit
      );
      allFees.push(...creditFees);
    }

    const feeClassifications = FeeClassifier.classifyAll(allFees);

    // Step 2: Calculate finance charges
    const financeCharges = this.calculateFinanceCharges(feeClassifications, input.financed_upfront_fees);

    // Step 3: Calculate note amount
    const noteAmount = this.calculateNoteAmount(input, feeClassifications);

    // Step 4: Calculate net amount financed
    const netAmountFinanced = this.calculateNetAmountFinanced(
      input.base_loan_amount,
      financeCharges
    );

    // Step 5: Generate payment schedule
    // The payment schedule generator will add financed fees to base_loan_amount to get note amount
    // This should match the noteAmount calculated in step 3
    const paymentSchedule = PaymentScheduleGenerator.generate(input);

    // Step 6: Solve for APR
    // Use interest rate as initial guess (APR should be close to or higher than interest rate)
    const solverResult = APRSolver.solve(paymentSchedule, netAmountFinanced, {
      tolerance: 1e-8,
      maxIterations: 100,
      initialGuess: input.note_rate_initial // Start with interest rate
    });

    // Validate solver converged
    if (!solverResult.converged) {
      throw new Error(
        `APR solver did not converge after ${solverResult.iterations} iterations. ` +
        `This may indicate invalid input data. ` +
        `Net Amount Financed: $${netAmountFinanced.toLocaleString()}, ` +
        `Payment Schedule Length: ${paymentSchedule.length} periods.`
      );
    }
    
    // Validate APR is reasonable
    // APR should always be >= interest rate when finance charges exist
    // APR can be < interest rate only if there are negative finance charges (credits > fees)
    if (financeCharges.total > 0 && solverResult.apr < input.note_rate_initial * 100) {
      throw new Error(
        `APR calculation error: APR (${solverResult.apr.toFixed(3)}%) is less than interest rate ` +
        `(${(input.note_rate_initial * 100).toFixed(3)}%) despite positive finance charges ` +
        `($${financeCharges.total.toLocaleString()}). This violates Reg Z requirements. ` +
        `Net Amount Financed: $${netAmountFinanced.toLocaleString()}, ` +
        `Note Amount: $${noteAmount.toLocaleString()}.`
      );
    }
    
    // Validate APR is within reasonable bounds (0% to 100%)
    if (solverResult.apr < 0 || solverResult.apr > 100) {
      throw new Error(
        `APR calculation error: APR (${solverResult.apr.toFixed(3)}%) is outside valid range (0-100%). ` +
        `This indicates a calculation error.`
      );
    }

    // Step 7: Get payment schedule summary
    const scheduleSummary = PaymentScheduleGenerator.getSummary(paymentSchedule);

    // Step 8: Build debug breakdown
    const financeChargesCash = feeClassifications
      .filter(fc => fc.is_finance_charge && fc.fee.paid_by === 'borrower_cash')
      .reduce((sum, fc) => sum + Math.max(0, fc.fee.amount), 0);

    const financeChargesFinanced = feeClassifications
      .filter(fc => fc.is_finance_charge && fc.fee.paid_by === 'financed')
      .reduce((sum, fc) => sum + Math.max(0, fc.fee.amount), 0);

    const financedUpfrontFeesTotal = input.financed_upfront_fees
      ? input.financed_upfront_fees.reduce((sum, f) => sum + f.amount, 0)
      : 0;

    const creditsApplied = (input.credits?.lender_credit || 0) + (input.credits?.seller_credit || 0);

    return {
      apr_annual: solverResult.apr,
      note_amount: noteAmount,
      net_amount_financed: netAmountFinanced,
      total_finance_charges: financeCharges.total,
      payment_schedule: paymentSchedule,
      payment_schedule_summary: scheduleSummary,
      fee_classifications: feeClassifications,
      debug_breakdown: {
        base_loan_amount: input.base_loan_amount,
        financed_upfront_fees_total: financedUpfrontFeesTotal,
        finance_charges_cash: financeChargesCash,
        finance_charges_financed: financeChargesFinanced,
        credits_applied: creditsApplied,
        solver_iterations: solverResult.iterations,
        solver_converged: solverResult.converged
      }
    };
  }

  /**
   * Calculate total finance charges
   */
  private static calculateFinanceCharges(
    feeClassifications: FeeClassification[],
    financedUpfrontFees?: FinancedUpfrontFee[]
  ): { total: number; cash: number; financed: number } {
    let cash = 0;
    let financed = 0;

    // Finance charges from fees
    feeClassifications.forEach(fc => {
      if (fc.is_finance_charge) {
        const amount = fc.fee.amount;
        if (amount > 0) {
          if (fc.fee.paid_by === 'borrower_cash' || fc.fee.paid_by === 'lender_credit') {
            cash += amount;
          } else if (fc.fee.paid_by === 'financed') {
            financed += amount;
          }
        } else if (amount < 0) {
          // Negative fee (credit) reduces finance charges
          // Both lender credits and seller credits reduce finance charges
          if (fc.fee.paid_by === 'lender_credit' || fc.fee.paid_by === 'seller_credit') {
            cash += amount; // Subtract (amount is already negative)
          }
        }
      }
    });

    // Finance charges from financed upfront fees (UFMIP, VA funding fee)
    if (financedUpfrontFees) {
      financedUpfrontFees.forEach(fee => {
        if (fee.is_finance_charge) {
          financed += fee.amount;
        }
      });
    }

    return {
      total: cash + financed,
      cash,
      financed
    };
  }

  /**
   * Calculate note amount (base loan + financed upfront fees)
   */
  private static calculateNoteAmount(
    input: APRInput,
    feeClassifications: FeeClassification[]
  ): number {
    let noteAmount = input.base_loan_amount;

    // Add financed upfront fees that adjust note balance
    if (input.financed_upfront_fees) {
      input.financed_upfront_fees.forEach(fee => {
        noteAmount += fee.amount;
      });
    }

    // Add other financed fees that adjust note balance
    feeClassifications.forEach(fc => {
      if (fc.is_amount_financed_adjustment && fc.fee.paid_by === 'financed') {
        noteAmount += fc.fee.amount;
      }
    });

    return noteAmount;
  }

  /**
   * Calculate net amount financed
   * Net Amount Financed = Base Loan Amount - Total Finance Charges
   * (Finance charges reduce amount financed regardless of payment method)
   */
  private static calculateNetAmountFinanced(
    baseLoanAmount: number,
    financeCharges: { total: number }
  ): number {
    return baseLoanAmount - financeCharges.total;
  }

  /**
   * Generate human-readable explanation of APR calculation
   */
  static explainAPR(input: APRInput): string {
    const result = this.calculate(input);
    const lines: string[] = [];

    lines.push('=== APR Calculation Breakdown ===\n');

    lines.push(`Base Loan Amount: $${result.debug_breakdown.base_loan_amount.toLocaleString()}`);
    lines.push(`Note Amount: $${result.note_amount.toLocaleString()}`);
    lines.push(`Net Amount Financed: $${result.net_amount_financed.toLocaleString()}\n`);

    lines.push('Finance Charges:');
    lines.push(`  Cash-paid: $${result.debug_breakdown.finance_charges_cash.toLocaleString()}`);
    lines.push(`  Financed: $${result.debug_breakdown.finance_charges_financed.toLocaleString()}`);
    lines.push(`  Total: $${result.total_finance_charges.toLocaleString()}\n`);

    if (result.debug_breakdown.credits_applied > 0) {
      lines.push(`Credits Applied: $${result.debug_breakdown.credits_applied.toLocaleString()}\n`);
    }

    lines.push('Fee Classifications:');
    result.fee_classifications.forEach(fc => {
      if (fc.is_finance_charge || fc.fee.amount < 0) {
        const sign = fc.fee.amount < 0 ? '-' : '+';
        lines.push(`  ${sign} $${Math.abs(fc.fee.amount).toLocaleString()} - ${fc.fee.name}`);
        lines.push(`    ${fc.explanation}`);
      }
    });

    lines.push(`\nCalculated APR: ${result.apr_annual.toFixed(3)}%`);
    lines.push(`Solver converged: ${result.debug_breakdown.solver_converged}`);
    lines.push(`Solver iterations: ${result.debug_breakdown.solver_iterations}`);

    lines.push('\nPayment Schedule Summary (first 12 + adjustments):');
    result.payment_schedule_summary.slice(0, 15).forEach(p => {
      const adj = p.is_adjustment ? ' [ADJ]' : '';
      const io = p.is_io_period ? ' [IO]' : '';
      lines.push(`  Period ${p.period}: $${p.payment.toFixed(2)} @ ${(p.note_rate * 100).toFixed(3)}%${adj}${io}`);
    });

    return lines.join('\n');
  }
}

// Export convenience function
export function calculateAPR(input: APRInput): APRResult {
  return APRCalculator.calculate(input);
}

export function explainAPR(input: APRInput): string {
  return APRCalculator.explainAPR(input);
}

// Re-export types
export * from './models';

