import React, { useState, useMemo } from 'react';
import { Scenario, CalculatedResults } from '../types';
import { FormattedNumberInput, LiveDecimalInput } from './CommonInputs';
import { formatMoney, formatPercent, formatDate } from '../utils/formatting';
import { Modal } from './Modal';
import {
  calculateCurrentLoanStatus,
  calculatePayoff,
  calculateBreakEven,
  calculateTotalInterest,
  calculateTermComparison,
  calculatePrepaymentScenario
} from '../services/refinanceCalculations';
import { generateRefinancePDF, generateRefinancePDFPreview } from '../services/refinancePDF';
import { TrendingUp, DollarSign, Clock, Calculator, FileText, Download, Info } from 'lucide-react';

interface Props {
  scenario: Scenario;
  results: CalculatedResults;
  onUpdateScenario: (updates: Partial<Scenario>) => void;
}

const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5";
const inputGroupClass = "flex items-center w-full bg-white border border-slate-200 rounded-lg shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all overflow-hidden h-10 group";
const symbolClass = "flex items-center justify-center h-full px-3 bg-slate-50 border-r border-slate-200 text-slate-400 text-sm font-semibold text-center min-w-[2.5rem] group-focus-within:bg-indigo-50 group-focus-within:text-indigo-600 group-focus-within:border-indigo-100 transition-colors";
const symbolRightClass = "flex items-center justify-center h-full px-3 bg-slate-50 border-l border-slate-200 text-slate-400 text-sm font-semibold text-center min-w-[2.5rem] group-focus-within:bg-indigo-50 group-focus-within:text-indigo-600 group-focus-within:border-indigo-100 transition-colors";

export const RefiAnalysisTab: React.FC<Props> = ({ scenario, results, onUpdateScenario }) => {
  const [anticipatedClosingDate, setAnticipatedClosingDate] = useState<string>('');
  const [customExtraPayment, setCustomExtraPayment] = useState<number>(0);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Ensure currentLoan exists
  const currentLoan = scenario.currentLoan || {
    originalAmount: 0,
    originalRate: 0,
    fundingDate: new Date().toISOString(),
    originalTerm: 360,
    currentMonthlyPayment: undefined
  };

  // Calculate current loan status - show section even with minimal data
  const loanStatus = useMemo(() => {
    if (!scenario.currentLoan || 
        !scenario.currentLoan.originalAmount || 
        scenario.currentLoan.originalAmount <= 0 ||
        !scenario.currentLoan.fundingDate) {
      return null;
    }
    try {
      return calculateCurrentLoanStatus(scenario.currentLoan);
    } catch (error) {
      console.error('Error calculating loan status:', error);
      return null;
    }
  }, [scenario.currentLoan]);

  // Calculate payoff
  const payoff = useMemo(() => {
    if (!loanStatus) return null;
    return calculatePayoff(
      loanStatus.currentPrincipalBalance,
      currentLoan.originalRate,
      anticipatedClosingDate || undefined
    );
  }, [loanStatus, currentLoan.originalRate, anticipatedClosingDate]);

  // Calculate current monthly payment
  const currentMonthlyPayment = useMemo(() => {
    if (!loanStatus) return 0;
    
    // Use override if provided, otherwise calculate from remaining balance and term
    let payment = currentLoan.currentMonthlyPayment;
    if (!payment && loanStatus.currentPrincipalBalance > 0 && loanStatus.remainingTermMonths > 0) {
      // Calculate payment using standard amortization formula
      const monthlyRate = (currentLoan.originalRate / 100) / 12;
      if (monthlyRate === 0) {
        payment = loanStatus.currentPrincipalBalance / loanStatus.remainingTermMonths;
      } else {
        const pvif = Math.pow(1 + monthlyRate, loanStatus.remainingTermMonths);
        payment = (monthlyRate * loanStatus.currentPrincipalBalance * pvif) / (pvif - 1);
      }
    }
    
    return payment || 0;
  }, [loanStatus, currentLoan]);

  // Calculate monthly savings
  const monthlySavings = useMemo(() => {
    return currentMonthlyPayment - results.monthlyPrincipalAndInterest;
  }, [currentMonthlyPayment, results.monthlyPrincipalAndInterest]);

  // Calculate break-even
  const breakEven = useMemo(() => {
    if (monthlySavings <= 0) return null;
    return calculateBreakEven(results.totalClosingCosts, monthlySavings);
  }, [results.totalClosingCosts, monthlySavings]);

  // Calculate total interest comparisons
  const interestComparison = useMemo(() => {
    if (!loanStatus) return null;
    const remainingInterestCurrent = calculateTotalInterest(
      loanStatus.currentPrincipalBalance,
      currentLoan.originalRate,
      loanStatus.remainingTermMonths
    );
    const totalInterestNew = calculateTotalInterest(
      results.totalLoanAmount,
      scenario.interestRate,
      scenario.loanTermMonths
    );
    return {
      remainingInterestCurrent,
      totalInterestNew,
      netSavings: remainingInterestCurrent - totalInterestNew
    };
  }, [loanStatus, currentLoan, results.totalLoanAmount, scenario.interestRate, scenario.loanTermMonths]);

  // Calculate 15 vs 30 year comparison
  const termComparison = useMemo(() => {
    const term30 = calculateTermComparison(results.totalLoanAmount, scenario.interestRate, 360);
    const term15 = calculateTermComparison(results.totalLoanAmount, scenario.interestRate - 0.375, 180); // Assume 0.375% lower rate for 15-year
    
    const yearsSaved = (term30.term - term15.term) / 12;
    const interestSaved = term30.totalInterest - term15.totalInterest;
    const monthlyDifference = term15.monthlyPayment - term30.monthlyPayment;

    return {
      term30: { ...term30, yearsSaved: 0, interestSaved: 0, monthlyDifference: 0 },
      term15: { ...term15, yearsSaved, interestSaved, monthlyDifference }
    };
  }, [results.totalLoanAmount, scenario.interestRate]);

  // Calculate prepayment scenarios
  const prepaymentScenarios = useMemo(() => {
    if (!loanStatus) return null;
    const base30YearPayment = termComparison.term30.monthlyPayment;
    const base15YearPayment = termComparison.term15.monthlyPayment;
    const difference = base15YearPayment - base30YearPayment;

    const matchingPayment = calculatePrepaymentScenario(
      results.totalLoanAmount,
      scenario.interestRate,
      360,
      difference
    );

    const halfDifference = calculatePrepaymentScenario(
      results.totalLoanAmount,
      scenario.interestRate,
      360,
      difference / 2
    );

    const custom = customExtraPayment > 0 ? calculatePrepaymentScenario(
      results.totalLoanAmount,
      scenario.interestRate,
      360,
      customExtraPayment
    ) : null;

    return {
      matchingPayment,
      halfDifference,
      custom,
      base30YearPayment,
      base15YearPayment,
      difference
    };
  }, [termComparison, results.totalLoanAmount, scenario.interestRate, customExtraPayment, loanStatus]);

  const handleCurrentLoanUpdate = (field: keyof typeof currentLoan, value: any) => {
    onUpdateScenario({
      currentLoan: {
        ...currentLoan,
        [field]: value
      }
    });
  };

  // Show helpful message if no current loan data yet
  const hasMinimalData = currentLoan.originalAmount > 0 && currentLoan.fundingDate;

  return (
    <div className="space-y-6 animate-fadeIn">
      {!hasMinimalData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-amber-900 mb-2">Enter Current Loan Information</h3>
              <p className="text-sm text-amber-800">
                To see refinance analysis calculations, please enter your current loan details above. 
                At minimum, enter the Original Loan Amount and Loan Funding Date to get started.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Current Loan Details */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
          <DollarSign size={16} className="text-slate-400" /> Original Loan Information
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Original Loan Amount</label>
            <div className={inputGroupClass}>
              <div className={symbolClass}>$</div>
              <FormattedNumberInput
                value={currentLoan.originalAmount}
                onChangeValue={(val) => handleCurrentLoanUpdate('originalAmount', val)}
                className="h-full px-4 text-sm text-slate-900 font-medium"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Original Interest Rate</label>
            <div className={inputGroupClass}>
              <LiveDecimalInput
                value={currentLoan.originalRate}
                onChange={(val) => handleCurrentLoanUpdate('originalRate', val)}
                precision={3}
                className="h-full pl-4 pr-4 text-sm text-slate-900 font-medium text-right"
              />
              <div className={symbolRightClass}>%</div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Loan Funding Date</label>
            <div className={inputGroupClass}>
              <input
                type="date"
                value={currentLoan.fundingDate ? currentLoan.fundingDate.split('T')[0] : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const date = new Date(e.target.value + 'T00:00:00');
                    handleCurrentLoanUpdate('fundingDate', date.toISOString());
                  }
                }}
                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Original Loan Term</label>
            <div className={inputGroupClass}>
              <select
                value={currentLoan.originalTerm}
                onChange={(e) => handleCurrentLoanUpdate('originalTerm', parseInt(e.target.value))}
                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900 border-0"
              >
                <option value={180}>15-year</option>
                <option value={240}>20-year</option>
                <option value={360}>30-year</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Current Monthly P&I Payment (Optional Override)</label>
            <div className={inputGroupClass}>
              <div className={symbolClass}>$</div>
              <FormattedNumberInput
                value={currentLoan.currentMonthlyPayment || 0}
                onChangeValue={(val) => handleCurrentLoanUpdate('currentMonthlyPayment', val > 0 ? val : undefined)}
                className="h-full px-4 text-sm text-slate-900 font-medium"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 italic">
              Leave empty to auto-calculate from loan details
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Automated Calculations - Current Loan Status */}
      {loanStatus && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            <Calculator size={16} className="text-slate-400" /> Current Loan Status (as of today)
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Months Elapsed</div>
              <div className="text-2xl font-black text-slate-900">{loanStatus.monthsElapsed}</div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Balance</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(loanStatus.currentPrincipalBalance)}</div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Interest Paid</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(loanStatus.totalInterestPaid)}</div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Principal Paid</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(loanStatus.totalPrincipalPaid)}</div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-indigo-900">Remaining Loan Term</span>
              <span className="text-lg font-black text-indigo-600">
                {Math.floor(loanStatus.remainingTermYears)} years, {loanStatus.remainingTermMonths % 12} months
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section 2B: Payoff Calculation */}
      {payoff && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            <Clock size={16} className="text-slate-400" /> Payoff Calculation
          </h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Principal Balance</div>
                <div className="text-2xl font-black text-slate-900 font-mono">{formatMoney(payoff.currentBalance)}</div>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Estimated Payoff Amount</div>
                <div className="text-2xl font-black text-slate-900 font-mono">{formatMoney(payoff.payoffAmount)}</div>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-amber-900 mb-1">Per Diem Interest</div>
                  <div className="text-lg font-black text-amber-700 font-mono mb-2">{formatMoney(payoff.perDiemInterest)}</div>
                  <div className="text-xs text-amber-700">
                    Add {formatMoney(payoff.perDiemInterest)} per day after {formatDate(new Date())}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Anticipated Closing Date (for exact payoff)</label>
              <div className={inputGroupClass}>
                <input
                  type="date"
                  value={anticipatedClosingDate}
                  onChange={(e) => setAnticipatedClosingDate(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2C: New Loan Details */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
          <TrendingUp size={16} className="text-slate-400" /> New Loan Details
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">New Loan Amount</div>
            <div className="text-xl font-black text-indigo-600 font-mono">{formatMoney(results.totalLoanAmount)}</div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">New Interest Rate</div>
            <div className="text-xl font-black text-indigo-600">{formatPercent(scenario.interestRate, 3)}</div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">New Loan Term</div>
            <div className="text-xl font-black text-indigo-600">{scenario.loanTermMonths / 12} years</div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">New Monthly P&I</div>
            <div className="text-xl font-black text-indigo-600 font-mono">{formatMoney(results.monthlyPrincipalAndInterest)}</div>
          </div>
          
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 md:col-span-2">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Closing Costs</div>
            <div className="text-xl font-black text-indigo-600 font-mono">{formatMoney(results.totalClosingCosts)}</div>
          </div>
        </div>
      </div>

      {/* Section 3: Monthly Savings Analysis */}
      {loanStatus && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            <Calculator size={16} className="text-slate-400" /> Monthly Savings Analysis
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Payment</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(currentMonthlyPayment)}</div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">New Payment</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(results.monthlyPrincipalAndInterest)}</div>
            </div>
            
            <div className={`p-4 rounded-lg border ${monthlySavings >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: monthlySavings >= 0 ? '#065f46' : '#991b1b' }}>
                Monthly {monthlySavings >= 0 ? 'Savings' : 'Increase'}
              </div>
              <div className={`text-xl font-black font-mono ${monthlySavings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {monthlySavings >= 0 ? '' : '+'}{formatMoney(Math.abs(monthlySavings))}
              </div>
            </div>
            
            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Annual Savings</div>
              <div className="text-xl font-black text-emerald-600 font-mono">{formatMoney(monthlySavings * 12)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3B: Break-Even Analysis */}
      {breakEven && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            <Clock size={16} className="text-slate-400" /> Break-Even Analysis
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Refinance Costs</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(breakEven.totalCosts)}</div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Monthly Savings</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(breakEven.monthlySavings)}</div>
            </div>
            
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Break-Even Point</div>
              <div className="text-xl font-black text-indigo-600">
                {breakEven.breakEvenMonths === Infinity ? 'Never' : `${breakEven.breakEvenMonths} months`}
              </div>
              {breakEven.breakEvenMonths !== Infinity && (
                <div className="text-xs text-indigo-600 mt-1">
                  ({breakEven.breakEvenYears.toFixed(1)} years)
                </div>
              )}
            </div>
            
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Break-Even Date</div>
              <div className="text-lg font-black text-indigo-600">
                {breakEven.breakEvenMonths === Infinity ? 'N/A' : formatDate(breakEven.breakEvenDate)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3C: Total Interest Comparison */}
      {interestComparison && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            <Calculator size={16} className="text-slate-400" /> Interest Over Life of Loan
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Remaining Interest (Current)</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(interestComparison.remainingInterestCurrent)}</div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Interest (New Loan)</div>
              <div className="text-xl font-black text-slate-900 font-mono">{formatMoney(interestComparison.totalInterestNew)}</div>
            </div>
            
            <div className={`p-4 rounded-lg border ${interestComparison.netSavings >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${interestComparison.netSavings >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                Net Interest {interestComparison.netSavings >= 0 ? 'Savings' : 'Cost'}
              </div>
              <div className={`text-xl font-black font-mono ${interestComparison.netSavings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatMoney(Math.abs(interestComparison.netSavings))}
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600 italic">
              Note: This comparison factors in closing costs. Total interest on new loan includes all payments over the full term.
            </p>
          </div>
        </div>
      )}

      {/* Section 4: 15-Year vs 30-Year Comparison */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
          <TrendingUp size={16} className="text-slate-400" /> 15-Year vs 30-Year Comparison
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider"></th>
                <th className="text-center p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-indigo-50">30-Year Refi</th>
                <th className="text-center p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-emerald-50">15-Year Refi</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="p-3 text-sm font-medium text-slate-700">Interest Rate</td>
                <td className="p-3 text-center font-mono text-slate-900">{formatPercent(termComparison.term30.interestRate, 3)}</td>
                <td className="p-3 text-center font-mono text-slate-900 bg-emerald-50/50">{formatPercent(termComparison.term15.interestRate, 3)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-3 text-sm font-medium text-slate-700">Monthly P&I</td>
                <td className="p-3 text-center font-mono text-slate-900">{formatMoney(termComparison.term30.monthlyPayment)}</td>
                <td className="p-3 text-center font-mono text-slate-900 bg-emerald-50/50">{formatMoney(termComparison.term15.monthlyPayment)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-3 text-sm font-medium text-slate-700">Total Interest</td>
                <td className="p-3 text-center font-mono text-slate-900">{formatMoney(termComparison.term30.totalInterest)}</td>
                <td className="p-3 text-center font-mono text-slate-900 bg-emerald-50/50">{formatMoney(termComparison.term15.totalInterest)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-3 text-sm font-medium text-slate-700">Payoff Date</td>
                <td className="p-3 text-center text-slate-900">{formatDate(termComparison.term30.payoffDate)}</td>
                <td className="p-3 text-center text-slate-900 bg-emerald-50/50">{formatDate(termComparison.term15.payoffDate)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="p-3 text-sm font-medium text-slate-700">Years Saved</td>
                <td className="p-3 text-center text-slate-400">--</td>
                <td className="p-3 text-center font-bold text-emerald-600 bg-emerald-50/50">{termComparison.term15.yearsSaved} years</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="p-3 text-sm font-medium text-slate-700">Interest Saved</td>
                <td className="p-3 text-center text-slate-400">--</td>
                <td className="p-3 text-center font-bold text-emerald-600 font-mono bg-emerald-50/50">{formatMoney(termComparison.term15.interestSaved)}</td>
              </tr>
              <tr>
                <td className="p-3 text-sm font-medium text-slate-700">Monthly Difference</td>
                <td className="p-3 text-center text-slate-400">--</td>
                <td className="p-3 text-center font-bold text-red-600 bg-emerald-50/50">+{formatMoney(termComparison.term15.monthlyDifference)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Prepayment Strategy Advisor */}
      {prepaymentScenarios && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-6 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            <Calculator size={16} className="text-slate-400" /> Prepayment Strategy Advisor
          </h3>
          
          <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">15-Year Required Payment</div>
                  <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(prepaymentScenarios.base15YearPayment)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">30-Year Base Payment</div>
                  <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(prepaymentScenarios.base30YearPayment)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Difference (Available for Extra)</div>
                  <div className="text-lg font-black text-emerald-600 font-mono">{formatMoney(prepaymentScenarios.difference)}</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-sm font-bold text-slate-900 mb-3">30-Year + Extra Payment Match (to equal 15-year payment)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pays off in</div>
                    <div className="text-lg font-black text-slate-900">{prepaymentScenarios.matchingPayment.payoffYears.toFixed(1)} years</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Interest</div>
                    <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(prepaymentScenarios.matchingPayment.totalInterest)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Interest Saved</div>
                    <div className="text-lg font-black text-emerald-600 font-mono">{formatMoney(prepaymentScenarios.matchingPayment.interestSaved)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Flexibility Benefit</div>
                    <div className="text-sm font-medium text-indigo-600">Can reduce payment if needed</div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-sm font-bold text-slate-900 mb-3">30-Year + Half the Difference</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Extra Payment</div>
                    <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(prepaymentScenarios.halfDifference.extraPayment)}/month</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pays off in</div>
                    <div className="text-lg font-black text-slate-900">{prepaymentScenarios.halfDifference.payoffYears.toFixed(1)} years</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Interest Saved</div>
                    <div className="text-lg font-black text-emerald-600 font-mono">{formatMoney(prepaymentScenarios.halfDifference.interestSaved)}</div>
                  </div>
                </div>
              </div>

              <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50/30">
                <h4 className="text-sm font-bold text-indigo-900 mb-2">Key Advantage</h4>
                <p className="text-sm text-slate-700 mb-3">
                  With the 30-year option, your required payment is {formatMoney(prepaymentScenarios.difference)} lower. 
                  You can choose to pay extra when you're able, but you have flexibility if circumstances change 
                  (job loss, emergency, etc.). The 15-year locks you into the higher payment.
                </p>
                <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200">
                  <h5 className="text-xs font-bold text-amber-900 mb-1">Risk Consideration</h5>
                  <p className="text-xs text-amber-800">
                    However, this requires discipline. If you don't consistently make extra payments, you'll pay 
                    the full 30-year interest amount of {formatMoney(termComparison.term30.totalInterest)}.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4">
                <h4 className="text-sm font-bold text-slate-900 mb-3">Calculate Custom Extra Payment Scenario</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Extra Monthly Payment</label>
                    <div className={inputGroupClass}>
                      <div className={symbolClass}>$</div>
                      <FormattedNumberInput
                        value={customExtraPayment}
                        onChangeValue={setCustomExtraPayment}
                        className="h-full px-4 text-sm text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                  {prepaymentScenarios.custom && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Payoff Time</div>
                        <div className="text-sm font-black text-slate-900">{prepaymentScenarios.custom.payoffYears.toFixed(1)} years</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Interest</div>
                        <div className="text-sm font-black text-slate-900 font-mono">{formatMoney(prepaymentScenarios.custom.totalInterest)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Interest Saved</div>
                        <div className="text-sm font-black text-emerald-600 font-mono">{formatMoney(prepaymentScenarios.custom.interestSaved)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Download Report Button */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-2 text-sm uppercase tracking-wide">
              <FileText size={16} className="text-slate-400" /> Refinance Analysis Report
            </h3>
            <p className="text-sm text-slate-600">
              Generate a comprehensive PDF report with all refinance analysis data
            </p>
          </div>
          <button
            onClick={async () => {
              if (!loanStatus || !payoff || !termComparison) {
                alert('Please fill in current loan information to generate the report.');
                return;
              }

              setGeneratingPDF(true);
              try {
                const analysisData = {
                  loanStatus,
                  payoff,
                  breakEven,
                  interestComparison,
                  termComparison,
                  prepaymentScenarios,
                  currentMonthlyPayment,
                  monthlySavings
                };

                const { pdfUrl, filename } = await generateRefinancePDFPreview(
                  scenario,
                  results,
                  analysisData
                );

                setPdfPreviewUrl(pdfUrl);
                setPdfFilename(filename);
                setShowPdfModal(true);
              } catch (error) {
                console.error('Error generating PDF:', error);
                alert('Error generating PDF. Please try again.');
              } finally {
                setGeneratingPDF(false);
              }
            }}
            disabled={generatingPDF || !loanStatus || !payoff}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors text-xs uppercase tracking-wide shadow-lg shadow-indigo-900/20"
          >
            {generatingPDF ? (
              <>
                <Clock size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download size={16} />
                Download Refinance Analysis
              </>
            )}
          </button>
        </div>
      </div>

      {/* PDF Preview Modal */}
      <Modal
        isOpen={showPdfModal && !!pdfPreviewUrl}
        onClose={() => {
          setShowPdfModal(false);
          if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
          }
        }}
        title="Refinance Analysis Preview"
        subtitle={pdfFilename}
        maxWidth="max-w-6xl"
        noPadding
      >
        <div className="flex flex-col h-[85vh]">
          <div className="flex-1 bg-slate-100 overflow-hidden">
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full border-0"
                title="Refinance Analysis Preview"
              />
            )}
          </div>
          
          <div className="bg-white border-t border-slate-200 p-4 flex justify-end gap-3 shrink-0">
            <button
              onClick={() => {
                setShowPdfModal(false);
                if (pdfPreviewUrl) {
                  URL.revokeObjectURL(pdfPreviewUrl);
                  setPdfPreviewUrl(null);
                }
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs uppercase hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                if (pdfPreviewUrl) {
                  const link = document.createElement('a');
                  link.href = pdfPreviewUrl;
                  link.download = pdfFilename;
                  link.click();
                }
              }}
              className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold text-xs uppercase hover:bg-indigo-500 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
            >
              <Download size={16} /> Download PDF
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

