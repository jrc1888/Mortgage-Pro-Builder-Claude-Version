import React, { useState, useMemo } from 'react';
import { Scenario, CalculatedResults } from '../types';
import { FormattedNumberInput, LiveDecimalInput, CustomCheckbox } from './CommonInputs';
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
import { calculatePMT } from '../services/loanMath';
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
  const [customExtraPayment, setCustomExtraPayment] = useState<number>(100);
  const [desiredPayoffTermMonths, setDesiredPayoffTermMonths] = useState<number>(180); // Default 15 years
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [acceleratedTermMonths, setAcceleratedTermMonths] = useState<number>(180); // Default 15 years
  const [acceleratedRateOverride, setAcceleratedRateOverride] = useState<number | null>(null); // Manual rate override

  // Ensure currentLoan exists
  const currentLoan = scenario.currentLoan || {
    originalAmount: 0,
    originalRate: 0,
    fundingDate: new Date().toISOString(),
    originalTerm: 360,
    currentMonthlyPayment: undefined,
    useManualOverride: false
  };

  // Check if manual override checkbox is checked
  const useManualOverride = currentLoan.useManualOverride || false;

  // Calculate current loan status - use manual override if checkbox is checked
  const loanStatus = useMemo(() => {
    if (useManualOverride && currentLoan.manualOverride) {
      // Use manual override values
      const override = currentLoan.manualOverride;
      // Return a simplified loan status using manual override
      return {
        currentPrincipalBalance: override.estimatedBalance || 0,
        remainingTermMonths: 0, // Will be calculated if needed
        remainingTermYears: 0,
        monthsElapsed: 0,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0
      } as any;
    }
    
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
  }, [scenario.currentLoan, useManualOverride, currentLoan.manualOverride]);

  // Calculate payoff
  const payoff = useMemo(() => {
    if (!loanStatus) return null;
    return calculatePayoff(
      loanStatus.currentPrincipalBalance,
      currentLoan.originalRate,
      anticipatedClosingDate || undefined
    );
  }, [loanStatus, currentLoan.originalRate, anticipatedClosingDate]);

  // Calculate full payment (PI + taxes/ins/HOA) - for current loan
  const monthlyTax = scenario.propertyTaxYearly / 12;
  const monthlyInsurance = scenario.homeInsuranceYearly / 12;

  // Calculate current monthly payment - use manual override if checkbox is checked
  const currentMonthlyPayment = useMemo(() => {
    // If manual override checkbox is checked, use override values
    if (useManualOverride && currentLoan.manualOverride) {
      const override = currentLoan.manualOverride;
      // Use estimated PI payment if provided, otherwise use estimated total payment minus taxes/ins/HOA
      if (override.estimatedPIPayment && override.estimatedPIPayment > 0) {
        return override.estimatedPIPayment;
      }
      if (override.estimatedTotalPayment && override.estimatedTotalPayment > 0) {
        const taxesInsHOA = monthlyTax + monthlyInsurance + (scenario.hoaMonthly || 0);
        return override.estimatedTotalPayment - taxesInsHOA;
      }
    }
    
    if (!loanStatus) return 0;
    
    // Use override if provided, otherwise calculate from remaining balance and term
    let payment = currentLoan.currentMonthlyPayment;
    if (!payment && loanStatus.currentPrincipalBalance > 0 && loanStatus.remainingTermMonths > 0) {
      // Use manual override interest rate if checkbox is checked, otherwise use current rate
      const rate = (useManualOverride && currentLoan.manualOverride?.interestRate) 
        ? currentLoan.manualOverride.interestRate 
        : currentLoan.originalRate;
      const monthlyRate = (rate / 100) / 12;
      if (monthlyRate === 0) {
        payment = loanStatus.currentPrincipalBalance / loanStatus.remainingTermMonths;
      } else {
        const pvif = Math.pow(1 + monthlyRate, loanStatus.remainingTermMonths);
        payment = (monthlyRate * loanStatus.currentPrincipalBalance * pvif) / (pvif - 1);
      }
    }
    
    return payment || 0;
  }, [loanStatus, currentLoan, useManualOverride, monthlyTax, monthlyInsurance, scenario.hoaMonthly]);

  // Calculate current full payment (P&I + taxes + insurance + MI + HOA + DPA)
  const currentFullPayment = useMemo(() => {
    const piPayment = currentMonthlyPayment;
    const breakdown = currentLoan.originalPaymentBreakdown || {};
    const monthlyTax = breakdown.monthlyTax !== undefined ? breakdown.monthlyTax : (scenario.propertyTaxYearly / 12);
    const monthlyInsurance = breakdown.monthlyInsurance !== undefined ? breakdown.monthlyInsurance : (scenario.homeInsuranceYearly / 12);
    const monthlyMI = breakdown.monthlyMI !== undefined ? breakdown.monthlyMI : results.monthlyMI;
    const hoaMonthly = breakdown.hoaMonthly !== undefined ? breakdown.hoaMonthly : (scenario.hoaMonthly || 0);
    const monthlyDPA = breakdown.monthlyDPA !== undefined ? breakdown.monthlyDPA : 0; // DPA typically not on current loan
    return piPayment + monthlyTax + monthlyInsurance + monthlyMI + hoaMonthly + monthlyDPA;
  }, [currentMonthlyPayment, currentLoan.originalPaymentBreakdown, scenario.propertyTaxYearly, scenario.homeInsuranceYearly, results.monthlyMI, scenario.hoaMonthly]);

  // Calculate new full payment (P&I + taxes + insurance + MI + HOA + DPA)
  const newFullPayment = useMemo(() => {
    return results.totalMonthlyPayment || (
      results.monthlyPrincipalAndInterest + 
      results.monthlyTax + 
      results.monthlyInsurance + 
      results.monthlyMI + 
      results.monthlyHOA + 
      results.monthlyDPAPayment + 
      (results.monthlyDPA2Payment || 0)
    );
  }, [results]);

  // Calculate monthly savings (full payment comparison)
  const monthlySavings = useMemo(() => {
    return currentFullPayment - newFullPayment;
  }, [currentFullPayment, newFullPayment]);

  // Calculate break-even
  const breakEven = useMemo(() => {
    if (monthlySavings <= 0) return null;
    return calculateBreakEven(results.totalClosingCosts, monthlySavings);
  }, [results.totalClosingCosts, monthlySavings]);

  // Calculate total interest comparisons - use manual override if checkbox is checked
  const interestComparison = useMemo(() => {
    if (!loanStatus) return null;
    const balance = useManualOverride && currentLoan.manualOverride?.estimatedBalance
      ? currentLoan.manualOverride.estimatedBalance
      : loanStatus.currentPrincipalBalance;
    const rate = useManualOverride && currentLoan.manualOverride?.interestRate
      ? currentLoan.manualOverride.interestRate
      : currentLoan.originalRate;
    // For manual override, we don't have remaining term, so skip this calculation
    const remainingInterestCurrent = useManualOverride 
      ? 0 // Can't calculate without term
      : calculateTotalInterest(
          balance,
          rate,
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
  }, [loanStatus, currentLoan, useManualOverride, results.totalLoanAmount, scenario.interestRate, scenario.loanTermMonths]);

  // Calculate 30 year vs accelerated paydown comparison
  const termComparison = useMemo(() => {
    const term30 = calculateTermComparison(results.totalLoanAmount, scenario.interestRate, 360);
    // Use manual rate override if provided, otherwise assume 0.375% lower rate for accelerated term
    const acceleratedRate = acceleratedRateOverride !== null 
      ? acceleratedRateOverride 
      : scenario.interestRate - 0.375;
    const termAccelerated = calculateTermComparison(results.totalLoanAmount, acceleratedRate, acceleratedTermMonths);
    
    const yearsSaved = (term30.term - termAccelerated.term) / 12;
    const interestSaved = term30.totalInterest - termAccelerated.totalInterest;
    const monthlyDifference = termAccelerated.monthlyPayment - term30.monthlyPayment;

    return {
      term30: { ...term30, yearsSaved: 0, interestSaved: 0, monthlyDifference: 0 },
      term15: { ...termAccelerated, yearsSaved, interestSaved, monthlyDifference }, // Keep term15 name for PDF compatibility
      termAccelerated: { ...termAccelerated, yearsSaved, interestSaved, monthlyDifference },
      acceleratedTermMonths,
      acceleratedRate
    };
  }, [results.totalLoanAmount, scenario.interestRate, acceleratedTermMonths, acceleratedRateOverride]);

  // Calculate prepayment scenarios (using accelerated term from comparison)
  const prepaymentScenarios = useMemo(() => {
    if (!loanStatus) return null;
    const base30YearPayment = termComparison.term30.monthlyPayment;
    const baseAcceleratedPayment = termComparison.termAccelerated.monthlyPayment;
    const difference = baseAcceleratedPayment - base30YearPayment;

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
      base15YearPayment: baseAcceleratedPayment, // Keep for PDF compatibility
      baseAcceleratedPayment: baseAcceleratedPayment,
      difference
    };
  }, [termComparison, results.totalLoanAmount, scenario.interestRate, customExtraPayment, loanStatus]);

  // Calculate desired payoff term scenario
  const desiredPayoffScenario = useMemo(() => {
    if (!desiredPayoffTermMonths || desiredPayoffTermMonths <= 0 || results.totalLoanAmount <= 0) {
      return null;
    }

    const monthlyRate = (scenario.interestRate / 100) / 12;
    const requiredPIPayment = calculatePMT(monthlyRate, desiredPayoffTermMonths, results.totalLoanAmount);
    // Full payment includes taxes, insurance, MI, HOA, DPA
    const requiredFullPayment = requiredPIPayment + 
      results.monthlyTax + 
      results.monthlyInsurance + 
      results.monthlyMI + 
      results.monthlyHOA + 
      results.monthlyDPAPayment + 
      (results.monthlyDPA2Payment || 0);
    
    const totalInterestForTerm = calculateTotalInterest(results.totalLoanAmount, scenario.interestRate, desiredPayoffTermMonths);
    const totalInterest30Year = calculateTotalInterest(results.totalLoanAmount, scenario.interestRate, 360);
    const interestSavings = totalInterest30Year - totalInterestForTerm;
    const paymentDifference = requiredFullPayment - newFullPayment;

    return {
      requiredPayment: requiredFullPayment,
      requiredPIPayment,
      totalInterestForTerm,
      interestSavings,
      paymentDifference
    };
  }, [desiredPayoffTermMonths, results, scenario.interestRate, newFullPayment]);

  const handleCurrentLoanUpdate = (field: keyof typeof currentLoan | 'manualOverride' | 'originalPaymentBreakdown', value: any) => {
    if (field === 'manualOverride') {
      onUpdateScenario({
        currentLoan: {
          ...currentLoan,
          manualOverride: value
        }
      });
    } else if (field === 'originalPaymentBreakdown') {
      onUpdateScenario({
        currentLoan: {
          ...currentLoan,
          originalPaymentBreakdown: value // Keep property name for backward compatibility
        }
      });
    } else {
      onUpdateScenario({
        currentLoan: {
          ...currentLoan,
          [field]: value
        }
      });
    }
  };

  // Show helpful message if no current loan data yet
  const hasMinimalData = currentLoan.originalAmount > 0 && currentLoan.fundingDate;

  return (
    <div className="space-y-4 animate-fadeIn">
      {!hasMinimalData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-amber-900 mb-2">Enter Current Loan Information</h3>
              <p className="text-sm text-amber-800">
                To see refinance analysis calculations, please enter your current loan details above. 
                At minimum, enter the Current Loan Amount and Loan Funding Date to get started.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Current Loan Details */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wide">
            <DollarSign size={16} className="text-slate-400" /> Current Loan Info
          </h3>
          <CustomCheckbox 
            checked={!useManualOverride} 
            onChange={(checked) => handleCurrentLoanUpdate('useManualOverride', !checked)} 
            label="Use"
          />
        </div>
        
        <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${useManualOverride ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex flex-col">
            <label className={`${labelClass} h-6 flex items-end`}>Loan Amt</label>
            <div className={inputGroupClass}>
              <div className={symbolClass}>$</div>
              <FormattedNumberInput
                value={currentLoan.originalAmount}
                onChangeValue={(val) => handleCurrentLoanUpdate('originalAmount', Math.round(val * 100) / 100)}
                className="h-full px-4 text-sm text-slate-900 font-medium"
                disabled={useManualOverride}
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className={`${labelClass} h-6 flex items-end`}>Int Rate</label>
            <div className={inputGroupClass}>
              <LiveDecimalInput
                value={currentLoan.originalRate}
                onChange={(val) => handleCurrentLoanUpdate('originalRate', val)}
                precision={3}
                className="h-full pl-4 pr-4 text-sm text-slate-900 font-medium text-right"
                disabled={useManualOverride}
              />
              <div className={symbolRightClass}>%</div>
            </div>
          </div>

          <div className="flex flex-col">
            <label className={`${labelClass} h-6 flex items-end`}>Funding Date</label>
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
                disabled={useManualOverride}
                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className={`${labelClass} h-6 flex items-end`}>Term (Mths)</label>
            <div className={inputGroupClass}>
              <input
                type="number"
                value={currentLoan.originalTerm || ''}
                onChange={(e) => handleCurrentLoanUpdate('originalTerm', parseInt(e.target.value) || 360)}
                onWheel={(e) => e.currentTarget.blur()}
                disabled={useManualOverride}
                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Manual Override Section */}
        <div className="border-t border-slate-300 pt-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-700">Manual Override</h4>
            <CustomCheckbox 
              checked={useManualOverride} 
              onChange={(checked) => handleCurrentLoanUpdate('useManualOverride', checked)} 
              label="Use"
            />
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${!useManualOverride ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col">
              <label className={`${labelClass} h-6 flex items-end`}>Interest Rate</label>
              <div className={inputGroupClass}>
                <LiveDecimalInput
                  value={currentLoan.manualOverride?.interestRate || 0}
                  onChange={(val) => handleCurrentLoanUpdate('manualOverride', {
                    ...(currentLoan.manualOverride || {}),
                    interestRate: val > 0 ? val : undefined
                  })}
                  precision={3}
                  className="h-full pl-4 pr-4 text-sm text-slate-900 font-medium text-right"
                  disabled={!useManualOverride}
                />
                <div className={symbolRightClass}>%</div>
              </div>
            </div>

            <div className="flex flex-col">
              <label className={`${labelClass} h-6 flex items-end`}>Est. Balance</label>
              <div className={inputGroupClass}>
                <div className={symbolClass}>$</div>
                <FormattedNumberInput
                  value={currentLoan.manualOverride?.estimatedBalance || 0}
                  onChangeValue={(val) => handleCurrentLoanUpdate('manualOverride', {
                    ...(currentLoan.manualOverride || {}),
                    estimatedBalance: val > 0 ? Math.round(val * 100) / 100 : undefined
                  })}
                  className="h-full px-4 text-sm text-slate-900 font-medium"
                  disabled={!useManualOverride}
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className={`${labelClass} h-6 flex items-end`}>Est. PI Pmt</label>
              <div className={inputGroupClass}>
                <div className={symbolClass}>$</div>
                <FormattedNumberInput
                  value={currentLoan.manualOverride?.estimatedPIPayment || 0}
                  onChangeValue={(val) => handleCurrentLoanUpdate('manualOverride', {
                    ...(currentLoan.manualOverride || {}),
                    estimatedPIPayment: val > 0 ? Math.round(val * 100) / 100 : undefined
                  })}
                  className="h-full px-4 text-sm text-slate-900 font-medium"
                  disabled={!useManualOverride}
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className={`${labelClass} h-6 flex items-end`}>Est. Total Pmt</label>
              <div className={inputGroupClass}>
                <div className={symbolClass}>$</div>
                <FormattedNumberInput
                  value={currentLoan.manualOverride?.estimatedTotalPayment || 0}
                  onChangeValue={(val) => handleCurrentLoanUpdate('manualOverride', {
                    ...(currentLoan.manualOverride || {}),
                    estimatedTotalPayment: val > 0 ? Math.round(val * 100) / 100 : undefined
                  })}
                  className="h-full px-4 text-sm text-slate-900 font-medium"
                  disabled={!useManualOverride}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Current Payment Breakdown Section */}
        <div className="border-t border-slate-300 pt-6 mt-6">
          <h4 className="text-sm font-bold text-slate-700 mb-4">Current Payment Breakdown</h4>
          {(() => {
            // Get P&I payment from either current loan info or manual override
            const piPayment = currentMonthlyPayment;
            
            // Get default values from new loan scenario
            const defaultTax = scenario.propertyTaxYearly / 12;
            const defaultInsurance = scenario.homeInsuranceYearly / 12;
            const defaultMI = results.monthlyMI;
            const defaultHOA = scenario.hoaMonthly || 0;
            const defaultDPA = results.monthlyDPAPayment || 0;
            
            // Use manual override values if set, otherwise use defaults
            const breakdown = currentLoan.originalPaymentBreakdown || {};
            const monthlyTax = breakdown.monthlyTax !== undefined ? breakdown.monthlyTax : defaultTax;
            const monthlyInsurance = breakdown.monthlyInsurance !== undefined ? breakdown.monthlyInsurance : defaultInsurance;
            const monthlyMI = breakdown.monthlyMI !== undefined ? breakdown.monthlyMI : defaultMI;
            const hoaMonthly = breakdown.hoaMonthly !== undefined ? breakdown.hoaMonthly : defaultHOA;
            const monthlyDPA = breakdown.monthlyDPA !== undefined ? breakdown.monthlyDPA : defaultDPA;
            
            const totalPayment = piPayment + monthlyTax + monthlyInsurance + monthlyMI + hoaMonthly + monthlyDPA;
            
            return (
              <div className="space-y-3">
                {/* P&I and Total on same line */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Principal & Interest</div>
                    <div className="text-lg font-black text-indigo-600 font-mono">{formatMoney(piPayment)}</div>
                  </div>
                  
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-300">
                    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Total Current Payment</div>
                    <div className="text-lg font-black text-slate-700 font-mono">{formatMoney(totalPayment)}</div>
                  </div>
                </div>
                
                {/* All 5 input boxes on same line */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className={labelClass}>Taxes (Mthly)</label>
                    <div className={inputGroupClass}>
                      <div className={symbolClass}>$</div>
                      <FormattedNumberInput
                        value={monthlyTax}
                        onChangeValue={(val) => handleCurrentLoanUpdate('originalPaymentBreakdown', {
                          ...breakdown,
                          monthlyTax: Math.round(val * 100) / 100
                        })}
                        className="h-full px-4 text-sm text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className={labelClass}>INS (Mthly)</label>
                    <div className={inputGroupClass}>
                      <div className={symbolClass}>$</div>
                      <FormattedNumberInput
                        value={monthlyInsurance}
                        onChangeValue={(val) => handleCurrentLoanUpdate('originalPaymentBreakdown', {
                          ...breakdown,
                          monthlyInsurance: Math.round(val * 100) / 100
                        })}
                        className="h-full px-4 text-sm text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className={labelClass}>MI (Mthly)</label>
                    <div className={inputGroupClass}>
                      <div className={symbolClass}>$</div>
                      <FormattedNumberInput
                        value={monthlyMI}
                        onChangeValue={(val) => handleCurrentLoanUpdate('originalPaymentBreakdown', {
                          ...breakdown,
                          monthlyMI: Math.round(val * 100) / 100
                        })}
                        className="h-full px-4 text-sm text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className={labelClass}>HOA (Mthly)</label>
                    <div className={inputGroupClass}>
                      <div className={symbolClass}>$</div>
                      <FormattedNumberInput
                        value={hoaMonthly}
                        onChangeValue={(val) => handleCurrentLoanUpdate('originalPaymentBreakdown', {
                          ...breakdown,
                          hoaMonthly: Math.round(val * 100) / 100
                        })}
                        className="h-full px-4 text-sm text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className={labelClass}>DPA (Mthly)</label>
                    <div className={inputGroupClass}>
                      <div className={symbolClass}>$</div>
                      <FormattedNumberInput
                        value={monthlyDPA}
                        onChangeValue={(val) => handleCurrentLoanUpdate('originalPaymentBreakdown', {
                          ...breakdown,
                          monthlyDPA: Math.round(val * 100) / 100
                        })}
                        className="h-full px-4 text-sm text-slate-900 font-medium"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Current Loan Status - Combined */}
        {loanStatus && (
          <>
            <div className="border-t border-slate-300 pt-6 mt-6">
              <h4 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide">
                <Calculator size={16} className="text-slate-400" /> Current Loan Status
              </h4>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 min-h-[14px]">MTHS Elapsed</div>
                  <div className="text-xl font-black text-slate-900 mt-auto">{loanStatus.monthsElapsed}</div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 min-h-[14px]">Balance</div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-auto">{formatMoney(loanStatus.currentPrincipalBalance)}</div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 min-h-[14px]">Interest Paid</div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-auto">{formatMoney(loanStatus.totalInterestPaid)}</div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 min-h-[14px]">Principal Paid</div>
                  <div className="text-lg font-black text-slate-900 font-mono mt-auto">{formatMoney(loanStatus.totalPrincipalPaid)}</div>
                </div>

                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex flex-col">
                  <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1 min-h-[14px]">Remaining</div>
                  <div className="text-lg font-black text-indigo-600 mt-auto">
                    {Math.floor(loanStatus.remainingTermYears)}y {loanStatus.remainingTermMonths % 12}m
                  </div>
                </div>
              </div>

              {/* Payoff Calculation - Combined */}
              {payoff && (
                <>
                  <div className="flex items-center justify-between mb-3 border-t border-slate-200 pt-4">
                    <h4 className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wide">
                      <Clock size={16} className="text-slate-400" /> Current Loan Payoff Calc
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 min-h-[14px]">Balance</div>
                      <div className="text-base font-black text-slate-900 font-mono mt-auto">{formatMoney(payoff.currentBalance)}</div>
                    </div>
                    
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex flex-col">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 min-h-[14px]">Payoff Amt</div>
                      <div className="text-base font-black text-slate-900 font-mono mt-auto">{formatMoney(payoff.payoffAmount)}</div>
                    </div>

                    <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 flex flex-col">
                      <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-1 min-h-[14px]">Per Diem</div>
                      <div className="text-base font-black text-amber-700 font-mono mt-auto">{formatMoney(payoff.perDiemInterest)}/day</div>
                    </div>

                    <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 flex flex-col">
                      <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-1 min-h-[14px]">Days ({anticipatedClosingDate ? payoff.daysToClosing : 0})</div>
                      <div className="text-base font-black text-amber-700 font-mono mt-auto">{formatMoney(anticipatedClosingDate ? Math.round(payoff.perDiemInterest * payoff.daysToClosing * 100) / 100 : 0)}</div>
                    </div>

                    <div className="flex flex-col">
                      <label className={`${labelClass} mb-1 min-h-[14px] flex items-end`}>Payoff Date</label>
                      <div className={`${inputGroupClass} mt-auto`}>
                        <input
                          type="date"
                          value={anticipatedClosingDate}
                          onChange={(e) => setAnticipatedClosingDate(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs outline-none bg-transparent font-medium text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Section 2C: New Loan Details - Compact */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide border-b border-slate-100 pb-2">
          <TrendingUp size={16} className="text-slate-400" /> New Loan Details
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Loan Amount</div>
            <div className="text-lg font-black text-indigo-600 font-mono">{formatMoney(results.totalLoanAmount)}</div>
          </div>
          
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Interest Rate</div>
            <div className="text-lg font-black text-indigo-600">{formatPercent(scenario.interestRate, 3)}</div>
          </div>
          
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Term</div>
            <div className="text-lg font-black text-indigo-600">{scenario.loanTermMonths / 12} years</div>
          </div>
          
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Monthly P&I</div>
            <div className="text-lg font-black text-indigo-600 font-mono">{formatMoney(results.monthlyPrincipalAndInterest)}</div>
          </div>
          
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Closing Costs</div>
            <div className="text-lg font-black text-indigo-600 font-mono">{formatMoney(results.totalClosingCosts)}</div>
          </div>
        </div>
      </div>

      {/* Section 3: Monthly Savings - Combined with Interest Comparison and Break-Even */}
      {loanStatus && (
        <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide border-b border-slate-200 pb-2">
            <Calculator size={16} className="text-slate-400" /> Monthly Savings
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Pmt</div>
              <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(currentFullPayment)}</div>
            </div>
            
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">New Pmt</div>
              <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(newFullPayment)}</div>
            </div>
            
            <div className={`p-3 rounded-lg border ${monthlySavings >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: monthlySavings >= 0 ? '#065f46' : '#991b1b' }}>
                Monthly {monthlySavings >= 0 ? 'Savings' : 'Increase'}
              </div>
              <div className={`text-lg font-black font-mono ${monthlySavings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {monthlySavings >= 0 ? '' : '+'}{formatMoney(Math.abs(monthlySavings))}
              </div>
            </div>
            
            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Annual Savings</div>
              <div className="text-lg font-black text-emerald-600 font-mono">{formatMoney(monthlySavings * 12)}</div>
            </div>
          </div>

          {/* Interest Comparison - Above Break-Even */}
          {interestComparison && (
            <>
              <div className="flex items-center justify-between mb-3 border-t border-slate-200 pt-4">
                <h4 className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wide">
                  <Calculator size={16} className="text-slate-400" /> Interest Comparison
                </h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Remaining (Current)</div>
                  <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(interestComparison.remainingInterestCurrent)}</div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total (New Loan)</div>
                  <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(interestComparison.totalInterestNew)}</div>
                </div>
                
                <div className={`p-3 rounded-lg border ${interestComparison.netSavings >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${interestComparison.netSavings >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Net {interestComparison.netSavings >= 0 ? 'Savings' : 'Cost'}
                  </div>
                  <div className={`text-lg font-black font-mono ${interestComparison.netSavings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatMoney(Math.abs(interestComparison.netSavings))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Break-Even - Below Interest Comparison */}
          {breakEven && (
            <>
              <div className="flex items-center justify-between mb-3 border-t border-slate-200 pt-4">
                <h4 className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wide">
                  <Clock size={16} className="text-slate-400" /> Break-Even
                </h4>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Costs</div>
                  <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(breakEven.totalCosts)}</div>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Monthly Savings</div>
                  <div className="text-lg font-black text-slate-900 font-mono">{formatMoney(breakEven.monthlySavings)}</div>
                </div>
                
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Break-Even</div>
                  <div className="text-lg font-black text-indigo-600">
                    {breakEven.breakEvenMonths === Infinity ? 'Never' : breakEven.breakEvenMonths > 360 ? '>360 mos' : `${breakEven.breakEvenMonths} mos`}
                  </div>
                </div>
                
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Break-Even Date</div>
                  <div className="text-base font-black text-indigo-600">
                    {breakEven.breakEvenMonths === Infinity ? 'N/A' : formatDate(breakEven.breakEvenDate)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Section 4: 30 Year vs Accelerated - Compact */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide border-b border-slate-100 pb-2">
          <TrendingUp size={16} className="text-slate-400" /> 30yr vs Accelerated
        </h3>
        
        {/* Controls for Accelerated Term */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Accelerated Term</label>
            <div className={inputGroupClass}>
              <select
                value={acceleratedTermMonths}
                onChange={(e) => setAcceleratedTermMonths(parseInt(e.target.value))}
                className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900 border-0"
              >
                <option value={180}>15-year</option>
                <option value={240}>20-year</option>
                <option value={300}>25-year</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Rate Override (opt)</label>
            <div className={inputGroupClass}>
              <LiveDecimalInput
                value={acceleratedRateOverride !== null ? acceleratedRateOverride : scenario.interestRate - 0.375}
                onChange={(val) => setAcceleratedRateOverride(val)}
                precision={3}
                className="h-full pl-4 pr-4 text-sm text-slate-900 font-medium text-right"
              />
              <div className={symbolRightClass}>%</div>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left p-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"></th>
                <th className="text-center p-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-indigo-50">30yr</th>
                <th className="text-center p-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-emerald-50">{acceleratedTermMonths / 12}yr</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="p-2 text-xs font-medium text-slate-700">Rate</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900">{formatPercent(termComparison.term30.interestRate, 3)}</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900 bg-emerald-50/50">{formatPercent(termComparison.acceleratedRate, 3)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-2 text-xs font-medium text-slate-700">Monthly P&I</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900">{formatMoney(termComparison.term30.monthlyPayment)}</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900 bg-emerald-50/50">{formatMoney(termComparison.termAccelerated.monthlyPayment)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-2 text-xs font-medium text-slate-700">Full Payment</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900">
                  {formatMoney(
                    termComparison.term30.monthlyPayment + 
                    results.monthlyTax + 
                    results.monthlyInsurance + 
                    results.monthlyMI + 
                    results.monthlyHOA + 
                    results.monthlyDPAPayment + 
                    (results.monthlyDPA2Payment || 0)
                  )}
                </td>
                <td className="p-2 text-center font-mono text-sm text-slate-900 bg-emerald-50/50">
                  {formatMoney(
                    termComparison.termAccelerated.monthlyPayment + 
                    results.monthlyTax + 
                    results.monthlyInsurance + 
                    results.monthlyMI + 
                    results.monthlyHOA + 
                    results.monthlyDPAPayment + 
                    (results.monthlyDPA2Payment || 0)
                  )}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-2 text-xs font-medium text-slate-700">Total Interest</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900">{formatMoney(termComparison.term30.totalInterest)}</td>
                <td className="p-2 text-center font-mono text-sm text-slate-900 bg-emerald-50/50">{formatMoney(termComparison.termAccelerated.totalInterest)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-2 text-xs font-medium text-slate-700">Payoff Date</td>
                <td className="p-2 text-center text-xs text-slate-900">{formatDate(termComparison.term30.payoffDate)}</td>
                <td className="p-2 text-center text-xs text-slate-900 bg-emerald-50/50">{formatDate(termComparison.termAccelerated.payoffDate)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="p-2 text-xs font-medium text-slate-700">Years Saved</td>
                <td className="p-2 text-center text-slate-400">--</td>
                <td className="p-2 text-center font-bold text-emerald-600 bg-emerald-50/50">{termComparison.termAccelerated.yearsSaved.toFixed(1)}y</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="p-2 text-xs font-medium text-slate-700">Interest Saved</td>
                <td className="p-2 text-center text-slate-400">--</td>
                <td className="p-2 text-center font-bold text-emerald-600 font-mono text-sm bg-emerald-50/50">{formatMoney(termComparison.termAccelerated.interestSaved)}</td>
              </tr>
              <tr>
                <td className="p-2 text-xs font-medium text-slate-700">Monthly Diff</td>
                <td className="p-2 text-center text-slate-400">--</td>
                <td className="p-2 text-center font-bold text-red-600 text-sm bg-emerald-50/50">+{formatMoney(termComparison.termAccelerated.monthlyDifference)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Prepayment Strategy - Reworked */}
      {prepaymentScenarios && loanStatus && (
        <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm">
          <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-4 text-sm uppercase tracking-wide border-b border-slate-200 pb-2">
            <Calculator size={16} className="text-slate-400" /> Prepayment Strategy
          </h3>
          
          <div className="space-y-4">
            {/* Box 1: Extra Monthly Payment */}
            <div className="border border-slate-200 rounded-lg p-3">
              <h4 className="text-xs font-bold text-slate-900 mb-3">Extra Monthly Payment</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-1">
                  <label className={labelClass}>Extra Monthly Pmt</label>
                  <div className={inputGroupClass}>
                    <div className={symbolClass}>$</div>
                    <FormattedNumberInput
                      value={customExtraPayment}
                      onChangeValue={setCustomExtraPayment}
                      className="h-full px-2 text-sm text-slate-900 font-medium"
                    />
                  </div>
                </div>
                {prepaymentScenarios.custom && (
                  <>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Payoff</div>
                      <div className="text-base font-black text-slate-900">{prepaymentScenarios.custom.payoffYears.toFixed(1)} years</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Interest</div>
                      <div className="text-base font-black text-slate-900 font-mono">{formatMoney(prepaymentScenarios.custom.totalInterest)}</div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Interest Saved</div>
                      <div className="text-base font-black text-emerald-600 font-mono">{formatMoney(prepaymentScenarios.custom.interestSaved)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Box 2: Desired Payoff Term */}
            <div className="border border-slate-200 rounded-lg p-3">
              <h4 className="text-xs font-bold text-slate-900 mb-3">Desired Payoff Term</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-1">
                  <label className={labelClass}>Payoff Term (Mths)</label>
                  <div className={inputGroupClass}>
                    <input
                      type="number"
                      value={desiredPayoffTermMonths || ''}
                      onChange={(e) => setDesiredPayoffTermMonths(parseInt(e.target.value) || 0)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full px-4 py-2 text-sm outline-none bg-transparent font-medium text-slate-900"
                    />
                  </div>
                </div>
                {desiredPayoffScenario && (
                  <>
                    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                      <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">New Full Payment</div>
                      <div className="text-base font-black text-indigo-600 font-mono">{formatMoney(desiredPayoffScenario.requiredPayment)}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${desiredPayoffScenario.paymentDifference >= 0 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${desiredPayoffScenario.paymentDifference >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        Monthly Increase
                      </div>
                      <div className={`text-base font-black font-mono ${desiredPayoffScenario.paymentDifference >= 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {desiredPayoffScenario.paymentDifference >= 0 ? '+' : ''}{formatMoney(Math.abs(desiredPayoffScenario.paymentDifference))}
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Interest Saved</div>
                      <div className="text-base font-black text-emerald-600 font-mono">{formatMoney(desiredPayoffScenario.interestSavings)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Download Report - Compact */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-slate-900 font-bold mb-1 text-sm uppercase tracking-wide">
              <FileText size={16} className="text-slate-400" /> Refi Analysis Report
            </h3>
            <p className="text-xs text-slate-600">
              Generate PDF report
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
                  currentMonthlyPayment: currentFullPayment, // Pass full payment for PDF
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

