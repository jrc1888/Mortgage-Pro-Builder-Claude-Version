import React from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { Scenario } from '../types';
import { calculateScenario } from '../services/loanMath';

interface Props {
  scenarios: Scenario[];
  onClose: () => void;
}

const formatMoney = (n: number) => Math.ceil(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const ScenarioComparison: React.FC<Props> = ({ scenarios, onClose }) => {
  if (scenarios.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>No scenarios selected for comparison</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">
          Close
        </button>
      </div>
    );
  }

  type ComparisonDataItem = {
    scenario: Scenario;
    results: ReturnType<typeof calculateScenario>;
    purchasePrice: number;
    downPayment: number;
    totalClosingCosts: number;
    interestRate: number;
    monthlyPayment: number;
    loanType: string;
  };

  const comparisonData: ComparisonDataItem[] = scenarios.map(scenario => {
    const results = calculateScenario(scenario);
    return {
      scenario,
      results,
      purchasePrice: scenario.purchasePrice,
      downPayment: scenario.downPaymentAmount,
      totalClosingCosts: results.totalClosingCosts,
      interestRate: scenario.interestRate,
      monthlyPayment: results.totalMonthlyPayment,
      loanType: scenario.loanType
    };
  });

  type MetricKey = 'purchasePrice' | 'downPayment' | 'totalClosingCosts' | 'interestRate' | 'monthlyPayment' | 'loanType';
  type MetricFormatter = (v: number | string) => string;
  
  const metrics: Array<{ label: string; key: MetricKey; format: MetricFormatter }> = [
    { label: 'Purchase Price', key: 'purchasePrice', format: formatMoney },
    { label: 'Down Payment', key: 'downPayment', format: formatMoney },
    { label: 'Total Closing Costs', key: 'totalClosingCosts', format: formatMoney },
    { label: 'Interest Rate', key: 'interestRate', format: (v: number | string) => `${Number(v).toFixed(3)}%` },
    { label: 'Monthly Payment', key: 'monthlyPayment', format: formatMoney },
    { label: 'Loan Type', key: 'loanType', format: (v: number | string) => String(v) }
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 h-20 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-black text-white">Scenario Comparison</h1>
        </div>
        <button
          onClick={onClose}
          className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </header>

      {/* Comparison Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-[1800px] mx-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-300">
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-64">
                    Metric
                  </th>
                  {comparisonData.map((data) => (
                    <th key={data.scenario.id} className="px-6 py-4 text-center border-l border-slate-200">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-full">
                          <div className={`inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border mb-2 ${
                            data.scenario.loanType === 'FHA' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            data.scenario.loanType === 'VA' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {data.scenario.loanType}
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-bold text-slate-900">{data.scenario.name}</span>
                          <span className="text-[10px] text-slate-500">{data.scenario.clientName}</span>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Purchase Details Section */}
                <tr className="bg-slate-100">
                  <td colSpan={comparisonData.length + 1} className="px-6 py-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase Details</span>
                  </td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Purchase Price</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.scenario.purchasePrice)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Down Payment</td>
                  {comparisonData.map((data) => {
                    const downPaymentPercent = data.scenario.purchasePrice > 0 
                      ? (data.scenario.downPaymentAmount / data.scenario.purchasePrice) * 100 
                      : 0;
                    return (
                      <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-base font-bold text-slate-900">{formatMoney(data.scenario.downPaymentAmount)}</span>
                          <span className="text-xs text-slate-500">({downPaymentPercent.toFixed(2)}%)</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Base Loan Amount</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.baseLoanAmount)}</span>
                    </td>
                  ))}
                </tr>
                {comparisonData.some(d => d.results.financedMIP > 0) && (
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">
                      {comparisonData[0]?.scenario.loanType === 'FHA' ? 'UFMIP' : 'VA Funding Fee'}
                    </td>
                    {comparisonData.map((data) => (
                      <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                        {data.results.financedMIP > 0 ? (
                          <span className="text-base font-bold text-slate-900">{formatMoney(data.results.financedMIP)}</span>
                        ) : (
                          <span className="text-sm text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )}
                <tr className="bg-slate-100 border-b-2 border-slate-300">
                  <td className="px-6 py-3 text-sm font-bold text-slate-900 border-r border-slate-200">Total Loan Amount</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-lg font-bold text-slate-900">{formatMoney(data.results.totalLoanAmount)}</span>
                    </td>
                  ))}
                </tr>
                
                {/* Monthly Breakdown Section */}
                <tr className="bg-slate-100">
                  <td colSpan={comparisonData.length + 1} className="px-6 py-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Monthly Breakdown</span>
                  </td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Principal & Interest</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.monthlyPrincipalAndInterest)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Property Taxes</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.monthlyTax)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Home Insurance</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.monthlyInsurance)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Mortgage Insurance</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.monthlyMI)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">HOA Dues</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.monthlyHOA)}</span>
                    </td>
                  ))}
                </tr>
                {comparisonData.some(d => d.scenario.dpa.active && !d.scenario.dpa.isDeferred) && (
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-indigo-600 border-r border-slate-200">DPA Loan (1st)</td>
                    {comparisonData.map((data) => {
                      const hasDPA = data.scenario.dpa.active && !data.scenario.dpa.isDeferred;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasDPA ? (
                            <span className="text-base font-bold text-indigo-600">{formatMoney(data.results.monthlyDPAPayment)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {comparisonData.some(d => d.scenario.dpa2?.active && !d.scenario.dpa2.isDeferred) && (
                  <tr className="bg-white border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-indigo-600 border-r border-slate-200">DPA Loan (2nd)</td>
                    {comparisonData.map((data) => {
                      const hasDPA2 = data.scenario.dpa2?.active && !data.scenario.dpa2.isDeferred;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasDPA2 ? (
                            <span className="text-base font-bold text-indigo-600">{formatMoney(data.results.monthlyDPA2Payment)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {comparisonData.some(d => d.scenario.buydown.active) && (
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">Buydown Subsidy (Yr 1)</td>
                    {comparisonData.map((data) => {
                      const hasBuydown = data.scenario.buydown.active;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasBuydown ? (
                            <span className="text-base font-bold text-emerald-600">-{formatMoney(data.results.baseMonthlyPayment - data.results.totalMonthlyPayment)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {comparisonData.some(d => d.scenario.occupancyType === 'Primary Residence' && (d.scenario.income?.rental || 0) > 0) && (
                  <tr className="bg-white border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">ADU Income Credit</td>
                    {comparisonData.map((data) => {
                      const hasADUCredit = data.scenario.occupancyType === 'Primary Residence' && (data.scenario.income?.rental || 0) > 0;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasADUCredit ? (
                            <span className="text-base font-bold text-emerald-600">-{formatMoney(data.scenario.income?.rental || 0)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr className="bg-slate-100 border-b-2 border-slate-300">
                  <td className="px-6 py-3 text-sm font-bold text-slate-900 border-r border-slate-200">Total Monthly Payment</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-lg font-bold text-emerald-600">{formatMoney(data.results.totalMonthlyPayment)}</span>
                    </td>
                  ))}
                </tr>

                {/* Cash to Close Section */}
                <tr className="bg-slate-100">
                  <td colSpan={comparisonData.length + 1} className="px-6 py-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {comparisonData[0]?.scenario.transactionType === 'Purchase' ? 'Cash to Close Statement' : 'Cash Required Statement'}
                    </span>
                  </td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Down Payment</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.downPaymentRequired)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Gross Closing Costs</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.totalClosingCosts)}</span>
                    </td>
                  ))}
                </tr>
                {comparisonData.some(d => d.scenario.showSellerConcessions && d.results.sellerConcessionsAmount > 0) && (
                  <tr className="bg-white border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">Seller Concessions</td>
                    {comparisonData.map((data) => {
                      const hasConcessions = data.scenario.showSellerConcessions && data.results.sellerConcessionsAmount > 0;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasConcessions ? (
                            <span className="text-base font-bold text-emerald-600">-{formatMoney(data.results.sellerConcessionsAmount)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {comparisonData.some(d => d.scenario.showLenderCredits && d.results.lenderCreditsAmount > 0) && (
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">Lender Credit</td>
                    {comparisonData.map((data) => {
                      const hasCredits = data.scenario.showLenderCredits && data.results.lenderCreditsAmount > 0;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasCredits ? (
                            <span className="text-base font-bold text-emerald-600">-{formatMoney(data.results.lenderCreditsAmount)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-slate-700 border-r border-slate-200">Closing Costs (Net)</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-slate-900">{formatMoney(data.results.netClosingCosts)}</span>
                    </td>
                  ))}
                </tr>
                {comparisonData.some(d => d.scenario.dpa.active) && (
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">DPA Funding</td>
                    {comparisonData.map((data) => {
                      const hasDPA = data.scenario.dpa.active;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasDPA ? (
                            <span className="text-base font-bold text-emerald-600">-{formatMoney(data.scenario.dpa.amount)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {comparisonData.some(d => d.scenario.dpa2?.active) && (
                  <tr className="bg-white border-b border-slate-100">
                    <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">DPA Funding (2nd)</td>
                    {comparisonData.map((data) => {
                      const hasDPA2 = data.scenario.dpa2?.active;
                      return (
                        <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                          {hasDPA2 ? (
                            <span className="text-base font-bold text-emerald-600">-{formatMoney(data.scenario.dpa2.amount)}</span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr className="bg-slate-50 border-t-2 border-slate-300 border-b border-slate-100">
                  <td className="px-6 py-3 text-xs font-bold text-slate-600 uppercase border-r border-slate-200">Total Cash to Close</td>
                  {comparisonData.map((data) => {
                    const cashToClose = data.results.downPaymentRequired + data.results.netClosingCosts - 
                                      (data.scenario.dpa.active ? data.scenario.dpa.amount : 0) - 
                                      (data.scenario.dpa2?.active ? data.scenario.dpa2.amount : 0);
                    return (
                      <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                        <span className="text-lg font-bold text-slate-900">{formatMoney(cashToClose)}</span>
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="px-6 py-3 text-sm font-semibold text-emerald-600 border-r border-slate-200">Earnest Money</td>
                  {comparisonData.map((data) => (
                    <td key={data.scenario.id} className="px-6 py-3 text-center border-l border-slate-200">
                      <span className="text-base font-bold text-emerald-600">-{formatMoney(data.results.earnestMoney)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-100 border-t-2 border-slate-400">
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 uppercase border-r border-slate-200">Net Cash to Close</td>
                  {comparisonData.map((data) => {
                    const cashToClose = data.results.downPaymentRequired + data.results.netClosingCosts - 
                                      (data.scenario.dpa.active ? data.scenario.dpa.amount : 0) - 
                                      (data.scenario.dpa2?.active ? data.scenario.dpa2.amount : 0);
                    const netCashToClose = cashToClose - data.results.earnestMoney;
                    return (
                      <td key={data.scenario.id} className="px-6 py-4 text-center border-l border-slate-200">
                        <span className="text-xl font-bold text-slate-900">{formatMoney(netCashToClose)}</span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

