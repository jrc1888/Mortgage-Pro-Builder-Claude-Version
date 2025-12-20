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
        <div className="max-w-[1800px] mx-auto space-y-6">
          {/* Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Metric
                  </th>
                  {comparisonData.map((data, idx) => (
                    <th key={data.scenario.id} className="px-6 py-4 text-center border-l border-slate-200">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-slate-900">{data.scenario.name}</span>
                        <span className="text-[10px] text-slate-500">{data.scenario.clientName}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric, metricIdx) => (
                  <tr key={metric.key} className={metricIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-700 border-r border-slate-200">
                      {metric.label}
                    </td>
                    {comparisonData.map((data) => {
                      const value: number | string = data[metric.key];
                      return (
                        <td key={data.scenario.id} className="px-6 py-4 text-center border-l border-slate-200">
                          <span className="text-base font-bold text-slate-900">
                            {metric.format(value)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detailed Breakdowns - Side by Side */}
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${scenarios.length}, 1fr)` }}>
            {comparisonData.map((data) => {
              const { scenario, results } = data;
              const hasDPA = scenario.dpa.active && !scenario.dpa.isDeferred;
              const hasDPA2 = scenario.dpa2?.active && !scenario.dpa2.isDeferred;
              const hasBuydown = scenario.buydown.active;
              const hasADUCredit = scenario.occupancyType === 'Primary Residence' && (scenario.income?.rental || 0) > 0;
              const totalCredits = (scenario.showSellerConcessions ? results.sellerConcessionsAmount : 0) + 
                                   (scenario.showLenderCredits ? results.lenderCreditsAmount : 0);
              const grossClosingCosts = results.totalClosingCosts;
              const netClosingCosts = results.netClosingCosts;
              const cashToClose = results.downPaymentRequired + netClosingCosts - (scenario.dpa.active ? scenario.dpa.amount : 0) - (scenario.dpa2?.active ? scenario.dpa2.amount : 0);
              const netCashToClose = cashToClose - results.earnestMoney;

              return (
                <div key={scenario.id} className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                  <div className="p-6 space-y-6">
                    {/* Monthly Breakdown */}
                    <div className="border-t border-slate-100 pt-4">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Monthly Breakdown</h3>
                      <div className="space-y-2 text-base">
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Principal & Interest</span>
                          <span className="font-bold text-slate-900">{formatMoney(results.monthlyPrincipalAndInterest)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Property Taxes</span>
                          <span className="font-bold text-slate-900">{formatMoney(results.monthlyTax)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Home Insurance</span>
                          <span className="font-bold text-slate-900">{formatMoney(results.monthlyInsurance)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Mortgage Insurance</span>
                          <span className="font-bold text-slate-900">{formatMoney(results.monthlyMI)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>HOA Dues</span>
                          <span className="font-bold text-slate-900">{formatMoney(results.monthlyHOA)}</span>
                        </div>
                        {hasDPA && (
                          <div className="flex justify-between items-center text-indigo-600 border-t border-indigo-50 pt-2 mt-2">
                            <span>DPA Loan (1st)</span>
                            <span className="font-bold">{formatMoney(results.monthlyDPAPayment)}</span>
                          </div>
                        )}
                        {hasDPA2 && (
                          <div className="flex justify-between items-center text-indigo-600 border-t border-indigo-50 pt-2 mt-2">
                            <span>DPA Loan (2nd)</span>
                            <span className="font-bold">{formatMoney(results.monthlyDPA2Payment)}</span>
                          </div>
                        )}
                        {hasBuydown && (
                          <div className="flex justify-between items-center text-emerald-600 border-t border-emerald-50 pt-2 mt-2">
                            <span>Buydown Subsidy (Yr 1)</span>
                            <span className="font-bold">-{formatMoney(results.baseMonthlyPayment - results.totalMonthlyPayment)}</span>
                          </div>
                        )}
                        {hasADUCredit && (
                          <div className="flex justify-between items-center text-emerald-600 border-t border-emerald-50 pt-2 mt-2">
                            <span>ADU Income Credit</span>
                            <span className="font-bold">-{formatMoney(scenario.income?.rental || 0)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Cash to Close Breakdown */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {scenario.transactionType === 'Purchase' ? 'Cash to Close Statement' : 'Cash Required Statement'}
                      </h3>
                      <div className="space-y-2 mb-3 text-sm">
                        {scenario.transactionType === 'Purchase' ? (
                          <>
                            <div className="flex justify-between text-slate-600">
                              <span>Down Payment</span>
                              <span className="font-bold text-slate-900">{formatMoney(results.downPaymentRequired)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Gross Closing Costs</span>
                              <span className="font-bold text-slate-900">{formatMoney(grossClosingCosts)}</span>
                            </div>
                            {scenario.showSellerConcessions && results.sellerConcessionsAmount > 0 && (
                              <div className="flex justify-between text-emerald-600">
                                <span>Seller Concessions</span>
                                <span className="font-bold">-{formatMoney(results.sellerConcessionsAmount)}</span>
                              </div>
                            )}
                            {scenario.showLenderCredits && results.lenderCreditsAmount > 0 && (
                              <div className="flex justify-between text-emerald-600">
                                <span>Lender Credit</span>
                                <span className="font-bold">-{formatMoney(results.lenderCreditsAmount)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-slate-600">
                              <span>Closing Costs (Net)</span>
                              <span className="font-bold text-slate-900">{formatMoney(netClosingCosts)}</span>
                            </div>
                            {scenario.dpa.active && (
                              <div className="flex justify-between text-emerald-600">
                                <span>DPA Funding</span>
                                <span className="font-bold">-{formatMoney(scenario.dpa.amount)}</span>
                              </div>
                            )}
                            {scenario.dpa2?.active && (
                              <div className="flex justify-between text-emerald-600">
                                <span>DPA Funding (2nd)</span>
                                <span className="font-bold">-{formatMoney(scenario.dpa2.amount)}</span>
                              </div>
                            )}
                            
                            {/* Subtotal before Earnest Money */}
                            <div className="border-t border-slate-300 pt-2 mt-2 flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-600 uppercase">Total Cash to Close</span>
                              <span className="text-lg font-bold text-slate-900">
                                {formatMoney(cashToClose)}
                              </span>
                            </div>
                            
                            {/* Earnest Money Deduction */}
                            <div className="mb-4">
                              <div className="flex justify-between text-emerald-600 text-sm">
                                <span>Earnest Money</span>
                                <span className="font-bold">-{formatMoney(results.earnestMoney)}</span>
                              </div>
                            </div>

                            {/* Net Cash to Close */}
                            <div className="border-t-2 border-slate-400 pt-3 mt-3 flex justify-between items-center">
                              <span className="text-sm font-bold text-slate-900 uppercase">Net Cash to Close</span>
                              <span className="text-xl font-bold text-slate-900">
                                {formatMoney(netCashToClose)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between text-slate-600">
                              <span>Cash Out</span>
                              <span className="font-bold text-slate-900">{formatMoney(results.downPaymentRequired)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Closing Costs (Net)</span>
                              <span className="font-bold text-slate-900">{formatMoney(netClosingCosts)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

