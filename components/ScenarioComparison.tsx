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

  const comparisonData = scenarios.map(scenario => {
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

  const metrics = [
    { label: 'Purchase Price', key: 'purchasePrice', format: formatMoney },
    { label: 'Down Payment', key: 'downPayment', format: formatMoney },
    { label: 'Total Closing Costs', key: 'totalClosingCosts', format: formatMoney },
    { label: 'Interest Rate', key: 'interestRate', format: (v: number) => `${v.toFixed(3)}%` },
    { label: 'Monthly Payment', key: 'monthlyPayment', format: formatMoney },
    { label: 'Loan Type', key: 'loanType', format: (v: string) => v }
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

      {/* Comparison Table */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-[1800px] mx-auto">
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
                    {comparisonData.map((data) => (
                      <td key={data.scenario.id} className="px-6 py-4 text-center border-l border-slate-200">
                        <span className="text-base font-bold text-slate-900">
                          {metric.format((data as any)[metric.key])}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

