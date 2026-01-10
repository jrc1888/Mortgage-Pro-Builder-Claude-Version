/**
 * APR Solver
 * Numerical solver to find APR that satisfies:
 * PV(payments, apr_monthly) = Net Amount Financed
 * 
 * Uses Newton-Raphson with bisection fallback for robustness
 */

import { PaymentScheduleEntry } from './models';

export interface SolverOptions {
  tolerance?: number;
  maxIterations?: number;
  initialGuess?: number;
}

export interface SolverResult {
  apr: number;
  converged: boolean;
  iterations: number;
  error?: string;
}

export class APRSolver {
  private static readonly DEFAULT_TOLERANCE = 1e-8; // Very precise
  private static readonly DEFAULT_MAX_ITERATIONS = 100;
  private static readonly DEFAULT_INITIAL_GUESS = 0.1; // 10% as starting point

  /**
   * Solve for APR using Newton-Raphson method with bisection fallback
   */
  static solve(
    paymentSchedule: PaymentScheduleEntry[],
    netAmountFinanced: number,
    options: SolverOptions = {}
  ): SolverResult {
    const tolerance = options.tolerance || this.DEFAULT_TOLERANCE;
    const maxIterations = options.maxIterations || this.DEFAULT_MAX_ITERATIONS;
    const initialGuess = options.initialGuess || this.DEFAULT_INITIAL_GUESS;

    // Validate inputs
    if (netAmountFinanced <= 0) {
      return {
        apr: 0,
        converged: false,
        iterations: 0,
        error: 'Net amount financed must be positive'
      };
    }

    if (paymentSchedule.length === 0) {
      return {
        apr: 0,
        converged: false,
        iterations: 0,
        error: 'Payment schedule is empty'
      };
    }

    // Try Newton-Raphson first (faster convergence)
    const newtonResult = this.newtonRaphson(
      paymentSchedule,
      netAmountFinanced,
      initialGuess,
      tolerance,
      maxIterations
    );

    if (newtonResult.converged) {
      return newtonResult;
    }

    // Fallback to bisection (more robust)
    return this.bisection(
      paymentSchedule,
      netAmountFinanced,
      0,
      1, // 0% to 100% range
      tolerance,
      maxIterations
    );
  }

  /**
   * Newton-Raphson method for faster convergence
   */
  private static newtonRaphson(
    schedule: PaymentScheduleEntry[],
    netAmount: number,
    initialGuess: number,
    tolerance: number,
    maxIterations: number
  ): SolverResult {
    let apr = initialGuess;
    let iterations = 0;

    for (let i = 0; i < maxIterations; i++) {
      iterations = i + 1;

      const { pv, pvDerivative } = this.presentValueWithDerivative(schedule, apr);

      const error = pv - netAmount;

      if (Math.abs(error) < tolerance) {
        return {
          apr: apr * 100, // Convert to percentage
          converged: true,
          iterations
        };
      }

      // Avoid division by zero
      if (Math.abs(pvDerivative) < 1e-10) {
        break; // Fall back to bisection
      }

      // Newton-Raphson update: x_new = x_old - f(x) / f'(x)
      const newApr = apr - error / pvDerivative;

      // Bounds check
      if (newApr < 0 || newApr > 1 || !isFinite(newApr)) {
        break; // Fall back to bisection
      }

      apr = newApr;
    }

    return {
      apr: apr * 100,
      converged: false,
      iterations
    };
  }

  /**
   * Bisection method (more robust, guaranteed to converge if solution exists)
   */
  private static bisection(
    schedule: PaymentScheduleEntry[],
    netAmount: number,
    low: number,
    high: number,
    tolerance: number,
    maxIterations: number
  ): SolverResult {
    // Verify we have a root in the interval
    const pvLow = this.presentValue(schedule, low);
    const pvHigh = this.presentValue(schedule, high);

    if ((pvLow - netAmount) * (pvHigh - netAmount) > 0) {
      // No root in interval, expand search
      high = 2; // Try up to 200%
    }

    let iterations = 0;

    for (let i = 0; i < maxIterations; i++) {
      iterations = i + 1;

      const mid = (low + high) / 2;
      const pvMid = this.presentValue(schedule, mid);
      const error = pvMid - netAmount;

      if (Math.abs(error) < tolerance) {
        return {
          apr: mid * 100, // Convert to percentage
          converged: true,
          iterations
        };
      }

      // Determine which half contains the root
      const pvLow = this.presentValue(schedule, low);
      const errorLow = pvLow - netAmount;

      if (errorLow * error < 0) {
        high = mid;
      } else {
        low = mid;
      }

      // Check if interval is too small
      if (high - low < tolerance) {
        break;
      }
    }

    const finalApr = (low + high) / 2;
    return {
      apr: finalApr * 100,
      converged: Math.abs(this.presentValue(schedule, finalApr) - netAmount) < tolerance * 10,
      iterations
    };
  }

  /**
   * Calculate present value of payment schedule at given APR
   */
  private static presentValue(
    schedule: PaymentScheduleEntry[],
    aprAnnual: number
  ): number {
    if (aprAnnual < 0) return Infinity;
    if (aprAnnual === 0) {
      // Sum of all payments (no discounting)
      return schedule.reduce((sum, p) => sum + p.payment, 0);
    }

    const monthlyRate = aprAnnual / 12;
    if (monthlyRate >= 1) return 0; // Invalid rate

    let pv = 0;

    for (const payment of schedule) {
      const discountFactor = Math.pow(1 + monthlyRate, -payment.period);
      pv += payment.payment * discountFactor;
    }

    return pv;
  }

  /**
   * Calculate present value and its derivative (for Newton-Raphson)
   */
  private static presentValueWithDerivative(
    schedule: PaymentScheduleEntry[],
    aprAnnual: number
  ): { pv: number; pvDerivative: number } {
    if (aprAnnual < 0) {
      return { pv: Infinity, pvDerivative: 0 };
    }

    const monthlyRate = aprAnnual / 12;
    if (monthlyRate >= 1) {
      return { pv: 0, pvDerivative: 0 };
    }

    let pv = 0;
    let pvDerivative = 0;

    for (const payment of schedule) {
      const period = payment.period;
      const discountFactor = Math.pow(1 + monthlyRate, -period);
      pv += payment.payment * discountFactor;

      // Derivative: d/dr [PV] = -period * payment * (1 + r)^(-period - 1) / 12
      // (divided by 12 because we're taking derivative w.r.t. annual rate)
      pvDerivative -= (period * payment.payment * discountFactor) / (12 * (1 + monthlyRate));
    }

    return { pv, pvDerivative };
  }
}





