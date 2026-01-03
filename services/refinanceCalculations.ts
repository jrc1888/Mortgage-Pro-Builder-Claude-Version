/**
 * Refinance Analysis Calculation Utilities
 * Provides functions for calculating refinance analysis metrics
 */

import { Scenario } from '../types';

export interface CurrentLoanStatus {
  monthsElapsed: number;
  currentPrincipalBalance: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  remainingTermMonths: number;
  remainingTermYears: number;
}

export interface PayoffCalculation {
  currentBalance: number;
  perDiemInterest: number;
  payoffAmount: number;
  daysToClosing: number;
  closingDate?: string;
}

export interface BreakEvenAnalysis {
  totalCosts: number;
  monthlySavings: number;
  breakEvenMonths: number;
  breakEvenYears: number;
  breakEvenDate: Date;
}

export interface TermComparison {
  term: number;
  interestRate: number;
  monthlyPayment: number;
  totalInterest: number;
  payoffDate: Date;
  yearsSaved?: number;
  interestSaved?: number;
  monthlyDifference?: number;
}

export interface PrepaymentScenario {
  extraPayment: number;
  payoffMonths: number;
  payoffYears: number;
  totalInterest: number;
  interestSaved: number;
  basePayment: number;
  totalPayment: number;
}

/**
 * Calculate monthly payment (PMT) using standard amortization formula
 * This is a local helper - if rate is 0, returns simple division
 */
function calculatePMT(rate: number, nper: number, pv: number): number {
  if (nper === 0) return 0;
  if (rate === 0) {
    // Simple case: no interest, just divide principal by number of payments
    return pv / nper;
  }
  const pvif = Math.pow(1 + rate, nper);
  const pmt = (rate * pv * pvif) / (pvif - 1);
  return isNaN(pmt) || pmt <= 0 ? 0 : pmt;
}

/**
 * Calculate remaining balance after N payments using amortization formula
 */
export function calculateRemainingBalance(
  principal: number,
  annualRate: number,
  termMonths: number,
  monthsElapsed: number
): number {
  if (monthsElapsed <= 0) return principal;
  if (monthsElapsed >= termMonths) return 0;
  
  const monthlyRate = (annualRate / 100) / 12;
  const monthlyPayment = calculatePMT(monthlyRate, termMonths, principal);
  
  if (monthlyPayment === 0) return principal;
  
  // Remaining balance formula: PV * (1 + r)^n - PMT * [((1 + r)^n - 1) / r]
  const balance = principal * Math.pow(1 + monthlyRate, monthsElapsed) 
    - monthlyPayment * ((Math.pow(1 + monthlyRate, monthsElapsed) - 1) / monthlyRate);
  
  return Math.max(0, balance);
}

/**
 * Calculate total interest paid up to a specific month
 */
export function calculateTotalInterestPaid(
  principal: number,
  annualRate: number,
  termMonths: number,
  monthsElapsed: number
): number {
  if (monthsElapsed <= 0) return 0;
  
  const monthlyRate = (annualRate / 100) / 12;
  const monthlyPayment = calculatePMT(monthlyRate, termMonths, principal);
  const currentBalance = calculateRemainingBalance(principal, annualRate, termMonths, monthsElapsed);
  
  // Total interest = (Monthly Payment * Months Paid) - (Original Principal - Current Balance)
  const totalPaid = monthlyPayment * monthsElapsed;
  const principalPaid = principal - currentBalance;
  const interestPaid = totalPaid - principalPaid;
  
  return Math.max(0, interestPaid);
}

/**
 * Calculate current loan status (balance, interest paid, etc.)
 */
export function calculateCurrentLoanStatus(currentLoan: Scenario['currentLoan']): CurrentLoanStatus | null {
  if (!currentLoan) return null;
  
  const { originalAmount, originalRate, fundingDate, originalTerm, currentMonthlyPayment } = currentLoan;
  
  if (!fundingDate) return null;
  
  const fundingDateObj = new Date(fundingDate);
  const today = new Date();
  const monthsElapsed = Math.max(0, Math.floor(
    (today.getFullYear() - fundingDateObj.getFullYear()) * 12 
    + (today.getMonth() - fundingDateObj.getMonth())
  ));
  
  const currentBalance = calculateRemainingBalance(originalAmount, originalRate, originalTerm, monthsElapsed);
  const totalInterestPaid = calculateTotalInterestPaid(originalAmount, originalRate, originalTerm, monthsElapsed);
  const totalPrincipalPaid = originalAmount - currentBalance;
  const remainingTermMonths = Math.max(0, originalTerm - monthsElapsed);
  const remainingTermYears = remainingTermMonths / 12;
  
  return {
    monthsElapsed,
    currentPrincipalBalance: currentBalance,
    totalInterestPaid,
    totalPrincipalPaid,
    remainingTermMonths,
    remainingTermYears
  };
}

/**
 * Calculate per diem (daily) interest
 */
export function calculatePerDiem(balance: number, annualRate: number): number {
  return (balance * (annualRate / 100)) / 365;
}

/**
 * Calculate payoff amount including accrued interest
 */
export function calculatePayoff(
  balance: number,
  annualRate: number,
  closingDate?: string
): PayoffCalculation {
  const currentDate = new Date();
  const closingDateObj = closingDate ? new Date(closingDate) : currentDate;
  
  // Calculate days between current date and closing date
  const daysDiff = Math.ceil((closingDateObj.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysToClosing = Math.max(0, daysDiff);
  
  const perDiem = calculatePerDiem(balance, annualRate);
  const accruedInterest = perDiem * daysToClosing;
  const payoffAmount = balance + accruedInterest;
  
  return {
    currentBalance: balance,
    perDiemInterest: perDiem,
    payoffAmount,
    daysToClosing,
    closingDate: closingDate || closingDateObj.toISOString()
  };
}

/**
 * Calculate break-even analysis
 */
export function calculateBreakEven(
  totalClosingCosts: number,
  monthlySavings: number
): BreakEvenAnalysis | null {
  if (monthlySavings <= 0) {
    // No savings, break-even is never reached
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 999);
    return {
      totalCosts: totalClosingCosts,
      monthlySavings: 0,
      breakEvenMonths: Infinity,
      breakEvenYears: Infinity,
      breakEvenDate: futureDate
    };
  }
  
  const breakEvenMonths = Math.ceil(totalClosingCosts / monthlySavings);
  const breakEvenYears = breakEvenMonths / 12;
  const breakEvenDate = new Date();
  breakEvenDate.setMonth(breakEvenDate.getMonth() + breakEvenMonths);
  
  return {
    totalCosts: totalClosingCosts,
    monthlySavings,
    breakEvenMonths,
    breakEvenYears,
    breakEvenDate
  };
}

/**
 * Calculate total interest over life of loan
 */
export function calculateTotalInterest(
  principal: number,
  annualRate: number,
  termMonths: number,
  monthsPaid: number = 0
): number {
  const monthlyRate = (annualRate / 100) / 12;
  const monthlyPayment = calculatePMT(monthlyRate, termMonths, principal);
  const totalPayments = monthlyPayment * (termMonths - monthsPaid);
  const remainingBalance = monthsPaid > 0 
    ? calculateRemainingBalance(principal, annualRate, termMonths, monthsPaid)
    : principal;
  const totalInterest = totalPayments - remainingBalance;
  
  return Math.max(0, totalInterest);
}

/**
 * Calculate loan comparison for a given term
 */
export function calculateTermComparison(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDate: Date = new Date()
): TermComparison {
  const monthlyRate = (annualRate / 100) / 12;
  const monthlyPayment = calculatePMT(monthlyRate, termMonths, principal);
  const totalInterest = calculateTotalInterest(principal, annualRate, termMonths);
  
  const payoffDate = new Date(startDate);
  payoffDate.setMonth(payoffDate.getMonth() + termMonths);
  
  return {
    term: termMonths,
    interestRate: annualRate,
    monthlyPayment,
    totalInterest,
    payoffDate
  };
}

/**
 * Calculate prepayment scenario (30-year with extra payments)
 */
export function calculatePrepaymentScenario(
  principal: number,
  annualRate: number,
  baseTermMonths: number,
  extraPayment: number
): PrepaymentScenario {
  const monthlyRate = (annualRate / 100) / 12;
  const baseMonthlyPayment = calculatePMT(monthlyRate, baseTermMonths, principal);
  const totalMonthlyPayment = baseMonthlyPayment + extraPayment;
  
  if (totalMonthlyPayment <= baseMonthlyPayment) {
    // No extra payment, return base scenario
    const totalInterest = calculateTotalInterest(principal, annualRate, baseTermMonths);
    return {
      extraPayment: 0,
      payoffMonths: baseTermMonths,
      payoffYears: baseTermMonths / 12,
      totalInterest,
      interestSaved: 0,
      basePayment: baseMonthlyPayment,
      totalPayment: baseMonthlyPayment
    };
  }
  
  // Calculate payoff time with extra payments using iterative approach
  let balance = principal;
  let months = 0;
  const maxMonths = baseTermMonths; // Cap at base term
  let totalInterestPaid = 0;
  
  while (balance > 0.01 && months < maxMonths) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = totalMonthlyPayment - interestPayment;
    
    if (principalPayment <= 0) break; // Payment doesn't cover interest
    
    balance = Math.max(0, balance - principalPayment);
    totalInterestPaid += interestPayment;
    months++;
  }
  
  // Compare to base scenario
  const baseTotalInterest = calculateTotalInterest(principal, annualRate, baseTermMonths);
  const interestSaved = baseTotalInterest - totalInterestPaid;
  
  return {
    extraPayment,
    payoffMonths: months,
    payoffYears: months / 12,
    totalInterest: totalInterestPaid,
    interestSaved: Math.max(0, interestSaved),
    basePayment: baseMonthlyPayment,
    totalPayment: totalMonthlyPayment
  };
}

/**
 * Generate monthly amortization schedule (for prepayment calculations)
 * Returns array of monthly balances and payments
 */
export function generateMonthlyAmortizationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  extraPayment: number = 0
): Array<{ month: number; balance: number; principal: number; interest: number; payment: number }> {
  const monthlyRate = (annualRate / 100) / 12;
  const basePayment = calculatePMT(monthlyRate, termMonths, principal);
  const totalPayment = basePayment + extraPayment;
  
  const schedule: Array<{ month: number; balance: number; principal: number; interest: number; payment: number }> = [];
  let balance = principal;
  
  for (let month = 1; month <= termMonths && balance > 0.01; month++) {
    const interest = balance * monthlyRate;
    const principalPayment = Math.min(balance, totalPayment - interest);
    balance = Math.max(0, balance - principalPayment);
    
    schedule.push({
      month,
      balance,
      principal: principalPayment,
      interest,
      payment: totalPayment
    });
  }
  
  return schedule;
}

