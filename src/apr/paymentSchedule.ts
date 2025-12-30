/**
 * Payment Schedule Generator
 * Creates payment schedules for different loan structures:
 * - Fixed rate (fully amortizing)
 * - Interest-only (IO) periods
 * - ARM (with rate adjustments)
 * - IO + ARM combinations
 */

import { APRInput, PaymentScheduleEntry, ARMParams, LoanStructure } from './models';

export class PaymentScheduleGenerator {
  /**
   * Generate full payment schedule for the loan
   */
  static generate(input: APRInput): PaymentScheduleEntry[] {
    const schedule: PaymentScheduleEntry[] = [];
    const termMonths = input.term_months;
    const ioMonths = input.io_months || 0;
    let currentBalance = input.base_loan_amount;

    // Add financed upfront fees to note balance
    // All financed upfront fees (UFMIP, VA funding fee) add to note balance
    if (input.financed_upfront_fees) {
      input.financed_upfront_fees.forEach(fee => {
        // Financed upfront fees always add to note balance
          currentBalance += fee.amount;
      });
    }

    const noteAmount = currentBalance;
    let currentRate = input.note_rate_initial;
    const monthlyRate = currentRate / 12;

    if (input.structure === 'fixed' || input.structure === 'io') {
      return this.generateFixedSchedule(input, noteAmount, ioMonths);
    } else if (input.structure === 'arm' || input.structure === 'io_arm') {
      return this.generateARMSchedule(input, noteAmount, ioMonths);
    }

    return schedule;
  }

  /**
   * Generate schedule for fixed-rate loan (with optional IO period)
   */
  private static generateFixedSchedule(
    input: APRInput,
    noteAmount: number,
    ioMonths: number
  ): PaymentScheduleEntry[] {
    const schedule: PaymentScheduleEntry[] = [];
    const termMonths = input.term_months;
    const monthlyRate = input.note_rate_initial / 12;
    let balance = noteAmount;

    // Interest-only period
    if (ioMonths > 0) {
      const ioPayment = balance * monthlyRate;
      
      for (let period = 1; period <= ioMonths; period++) {
        const interest = balance * monthlyRate;
        const principal = 0;
        balance = balance; // No principal reduction during IO

        schedule.push({
          period,
          payment: ioPayment,
          principal,
          interest,
          balance,
          note_rate: input.note_rate_initial,
          is_io_period: true
        });
      }

      // After IO period, re-amortize remaining balance over P&I term
      // The total term should be ioMonths + piTermMonths
      // piTermMonths = termMonths - ioMonths
      const piTermMonths = termMonths - ioMonths;
      const remainingBalance = balance;
      
      // Only amortize if there's a P&I period
      if (piTermMonths > 0) {
        const amortizingPayment = this.calculateAmortizingPayment(
          remainingBalance,
          monthlyRate,
          piTermMonths
        );

        for (let period = ioMonths + 1; period <= termMonths; period++) {
          const interest = balance * monthlyRate;
          const principal = amortizingPayment - interest;
          balance = balance - principal;

          schedule.push({
            period,
            payment: amortizingPayment,
            principal,
            interest,
            balance: Math.max(0, balance),
            note_rate: input.note_rate_initial,
            is_io_period: false
          });
        }
      } else {
        // Fully IO loan - add final balloon payment
        schedule.push({
          period: ioMonths + 1,
          payment: balance, // Balloon payment
          principal: balance,
          interest: 0,
          balance: 0,
          note_rate: input.note_rate_initial,
          is_io_period: false
        });
      }
    } else {
      // Fully amortizing from start
      const payment = this.calculateAmortizingPayment(noteAmount, monthlyRate, termMonths);

      for (let period = 1; period <= termMonths; period++) {
        const interest = balance * monthlyRate;
        const principal = payment - interest;
        balance = balance - principal;

        schedule.push({
          period,
          payment,
          principal,
          interest,
          balance: Math.max(0, balance),
          note_rate: input.note_rate_initial,
          is_io_period: false
        });
      }
    }

    return schedule;
  }

  /**
   * Generate schedule for ARM loan (with optional IO period)
   */
  private static generateARMSchedule(
    input: APRInput,
    noteAmount: number,
    ioMonths: number
  ): PaymentScheduleEntry[] {
    if (!input.arm_params) {
      throw new Error('ARM parameters required for ARM structure');
    }

    const schedule: PaymentScheduleEntry[] = [];
    const termMonths = input.term_months;
    const arm = input.arm_params;
    let balance = noteAmount;
    let currentRate = input.note_rate_initial;
    let lastAdjustmentPeriod = 0;

    // Use constant index assumption (Mode 1) unless curve provided
    const useConstantIndex = arm.use_constant_index !== false;
    const targetRateAfterAdjustment = arm.index_initial + arm.margin;

    // Initial fixed period
    const initialFixedMonths = Math.min(arm.initial_fixed_months, termMonths);
    const monthlyRate = currentRate / 12;

    // Interest-only period (if any) during initial fixed
    if (ioMonths > 0) {
      const ioPeriods = Math.min(ioMonths, initialFixedMonths);
      
      for (let period = 1; period <= ioPeriods; period++) {
        const interest = balance * monthlyRate;
        const payment = interest; // IO payment
        balance = balance; // No principal reduction

        schedule.push({
          period,
          payment,
          principal: 0,
          interest,
          balance,
          note_rate: currentRate,
          is_io_period: true
        });
      }

      // Continue with remaining initial fixed period (amortizing)
      if (ioPeriods < initialFixedMonths) {
        const remainingInitialFixed = initialFixedMonths - ioPeriods;
        const remainingBalance = balance;
        const remainingMonths = termMonths - ioPeriods;
        const amortizingPayment = this.calculateAmortizingPayment(
          remainingBalance,
          monthlyRate,
          remainingMonths
        );

        for (let period = ioPeriods + 1; period <= initialFixedMonths; period++) {
          const interest = balance * monthlyRate;
          const principal = amortizingPayment - interest;
          balance = balance - principal;

          schedule.push({
            period,
            payment: amortizingPayment,
            principal,
            interest,
            balance: Math.max(0, balance),
            note_rate: currentRate,
            is_io_period: false
          });
        }
      }
    } else {
      // Fully amortizing during initial fixed period
      const remainingMonths = termMonths;
      const amortizingPayment = this.calculateAmortizingPayment(noteAmount, monthlyRate, remainingMonths);

      for (let period = 1; period <= initialFixedMonths; period++) {
        const interest = balance * monthlyRate;
        const principal = amortizingPayment - interest;
        balance = balance - principal;

        schedule.push({
          period,
          payment: amortizingPayment,
          principal,
          interest,
          balance: Math.max(0, balance),
          note_rate: currentRate,
          is_io_period: false
        });
      }
    }

    // After initial fixed period, handle adjustments
    lastAdjustmentPeriod = initialFixedMonths;

    for (let period = initialFixedMonths + 1; period <= termMonths; period++) {
      // Check if this is an adjustment period
      const periodsSinceLastAdjustment = period - lastAdjustmentPeriod;
      const shouldAdjust = periodsSinceLastAdjustment >= arm.adjust_freq_months;

      if (shouldAdjust) {
        // Calculate new rate
        let newRate: number;
        
        if (useConstantIndex && !arm.index_curve) {
          // Mode 1: Constant index assumption
          newRate = targetRateAfterAdjustment;
        } else if (arm.index_curve && arm.index_curve.length > 0) {
          // Mode 2: Use index curve
          const adjustmentNumber = Math.floor((period - initialFixedMonths - 1) / arm.adjust_freq_months);
          const indexValue = arm.index_curve[Math.min(adjustmentNumber, arm.index_curve.length - 1)] || arm.index_initial;
          newRate = indexValue + arm.margin;
        } else {
          newRate = targetRateAfterAdjustment;
        }

        // Apply caps and floors
        const previousRate = currentRate;
        const maxIncrease = previousRate + arm.periodic_cap;
        const maxRate = input.note_rate_initial + arm.lifetime_cap;
        const minRate = arm.lifetime_floor !== undefined 
          ? input.note_rate_initial - (input.note_rate_initial - arm.lifetime_floor)
          : undefined;

        newRate = Math.min(newRate, maxIncrease, maxRate);
        if (minRate !== undefined) {
          newRate = Math.max(newRate, minRate);
        }

        currentRate = newRate;
        lastAdjustmentPeriod = period;

        // Recalculate payment for remaining term
        const remainingMonths = termMonths - period + 1;
        const remainingBalance = balance;
        const newMonthlyRate = currentRate / 12;
        const newPayment = this.calculateAmortizingPayment(
          remainingBalance,
          newMonthlyRate,
          remainingMonths
        );

        const interest = balance * newMonthlyRate;
        const principal = newPayment - interest;
        balance = balance - principal;

        schedule.push({
          period,
          payment: newPayment,
          principal,
          interest,
          balance: Math.max(0, balance),
          note_rate: currentRate,
          is_adjustment: true,
          is_io_period: false
        });
      } else {
        // Continue with current rate
        const remainingMonths = termMonths - period + 1;
        const remainingBalance = balance;
        const monthlyRate = currentRate / 12;
        const payment = this.calculateAmortizingPayment(
          remainingBalance,
          monthlyRate,
          remainingMonths
        );

        const interest = balance * monthlyRate;
        const principal = payment - interest;
        balance = balance - principal;

        schedule.push({
          period,
          payment,
          principal,
          interest,
          balance: Math.max(0, balance),
          note_rate: currentRate,
          is_io_period: false
        });
      }
    }

    return schedule;
  }

  /**
   * Calculate amortizing payment using standard formula
   * PMT = PV * r * (1 + r)^n / ((1 + r)^n - 1)
   */
  private static calculateAmortizingPayment(
    principal: number,
    monthlyRate: number,
    months: number
  ): number {
    if (monthlyRate === 0) {
      return principal / months;
    }

    if (months === 0) {
      return 0;
    }

    const factor = Math.pow(1 + monthlyRate, months);
    const payment = principal * monthlyRate * factor / (factor - 1);

    return payment;
  }

  /**
   * Get summary of payment schedule (first 12 payments + adjustment events)
   */
  static getSummary(schedule: PaymentScheduleEntry[]): PaymentScheduleEntry[] {
    const summary: PaymentScheduleEntry[] = [];
    const first12 = schedule.slice(0, 12);
    summary.push(...first12);

    // Add all adjustment events
    const adjustments = schedule.filter(p => p.is_adjustment);
    summary.push(...adjustments);

    // Remove duplicates (if adjustment is in first 12)
    const seen = new Set<number>();
    return summary.filter(p => {
      if (seen.has(p.period)) return false;
      seen.add(p.period);
      return true;
    }).sort((a, b) => a.period - b.period);
  }
}

