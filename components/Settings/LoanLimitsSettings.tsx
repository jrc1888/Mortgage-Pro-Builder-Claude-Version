import React, { useState } from 'react';
import { FormattedNumberInput } from '../CommonInputs';
import { Save, RotateCcw } from 'lucide-react';
import { DEFAULT_LOAN_LIMITS, DEFAULT_LTV_RULES } from '../../services/validation';
import type { LoanLimits, LTVRules } from '../../services/validation';

interface Props {
  initialLimits?: LoanLimits;
  initialRules?: LTVRules;
  onSave: (limits: LoanLimits, rules: LTVRules) => void;
}

export const LoanLimitsSettings: React.FC<Props> = ({ 
  initialLimits = DEFAULT_LOAN_LIMITS,
  initialRules = DEFAULT_LTV_RULES,
  onSave 
}) => {
  const [limits, setLimits] = useState<LoanLimits>(initialLimits);
  const [rules, setRules] = useState<LTVRules>(initialRules);
  const [hasChanges, setHasChanges] = useState(false);

  const updateLimit = (loanType: keyof LoanLimits, field: string, value: number) => {
    setLimits(prev => ({
      ...prev,
      [loanType]: {
        ...prev[loanType],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const updateRule = (loanType: keyof LTVRules, field: string, value: number) => {
    setRules(prev => ({
      ...prev,
      [loanType]: {
        ...prev[loanType],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(limits, rules);
    setHasChanges(false);
  };

  const handleReset = () => {
    if (confirm('Reset all values to defaults?')) {
      setLimits(DEFAULT_LOAN_LIMITS);
      setRules(DEFAULT_LTV_RULES);
      setHasChanges(true);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none";
  const labelClass = "block text-xs font-bold text-slate-600 mb-1.5";
  const sectionClass = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Validation Settings</h2>
          <p className="text-sm text-slate-500 mt-1">Configure loan limits and LTV rules for validation warnings</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-semibold"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm font-semibold shadow-lg"
          >
            <Save size={16} />
            Save Changes
          </button>
        </div>
      </div>

      {/* Loan Limits */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="w-1 h-6 bg-indigo-600 rounded"></span>
          Loan Limits
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Conventional */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">Conventional Loans</h4>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Conforming Limit</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-semibold">$</span>
                  <FormattedNumberInput
                    value={limits.conventional.conforming}
                    onChangeValue={(val) => updateLimit('conventional', 'conforming', val)}
                    className={inputClass}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Standard conforming loan limit (2024: $766,550)</p>
              </div>
              <div>
                <label className={labelClass}>High-Balance Limit</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-semibold">$</span>
                  <FormattedNumberInput
                    value={limits.conventional.highBalance}
                    onChangeValue={(val) => updateLimit('conventional', 'highBalance', val)}
                    className={inputClass}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">High-cost area limit (2024: $1,149,825)</p>
              </div>
            </div>
          </div>

          {/* FHA */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">FHA Loans</h4>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Floor Limit</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-semibold">$</span>
                  <FormattedNumberInput
                    value={limits.fha.floor}
                    onChangeValue={(val) => updateLimit('fha', 'floor', val)}
                    className={inputClass}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Minimum FHA loan limit</p>
              </div>
              <div>
                <label className={labelClass}>Ceiling Limit</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-semibold">$</span>
                  <FormattedNumberInput
                    value={limits.fha.ceiling}
                    onChangeValue={(val) => updateLimit('fha', 'ceiling', val)}
                    className={inputClass}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Maximum FHA loan limit (high-cost areas)</p>
              </div>
            </div>
          </div>

          {/* Jumbo */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">Jumbo Loans</h4>
            <div>
              <label className={labelClass}>Minimum Loan Amount</label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">$</span>
                <FormattedNumberInput
                  value={limits.jumbo.minimum}
                  onChangeValue={(val) => updateLimit('jumbo', 'minimum', val)}
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Loans above conforming limit</p>
            </div>
          </div>

          {/* VA */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">VA Loans</h4>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-800 font-medium">
                ✓ VA loans have no maximum loan limit
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                Eligible veterans can borrow any amount (subject to lender approval)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* LTV Rules */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="w-1 h-6 bg-purple-600 rounded"></span>
          LTV & Down Payment Rules
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Conventional LTV */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">Conventional</h4>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Minimum Down Payment (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.conventional.minDownPayment}
                    onChange={(e) => updateRule('conventional', 'minDownPayment', parseFloat(e.target.value) || 3)}
                    className={inputClass}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Maximum LTV (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.conventional.maxLTV}
                    onChange={(e) => updateRule('conventional', 'maxLTV', parseFloat(e.target.value) || 97)}
                    className={inputClass}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
              <div>
                <label className={labelClass}>PMI Required Below (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.conventional.pmiRequired}
                    onChange={(e) => updateRule('conventional', 'pmiRequired', parseFloat(e.target.value) || 80)}
                    className={inputClass}
                    step="1"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Equity required to avoid PMI</p>
              </div>
            </div>
          </div>

          {/* FHA LTV */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">FHA</h4>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Minimum Down Payment (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.fha.minDownPayment}
                    onChange={(e) => updateRule('fha', 'minDownPayment', parseFloat(e.target.value) || 3.5)}
                    className={inputClass}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Maximum LTV (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.fha.maxLTV}
                    onChange={(e) => updateRule('fha', 'maxLTV', parseFloat(e.target.value) || 96.5)}
                    className={inputClass}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* VA LTV */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">VA</h4>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Minimum Down Payment (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.va.minDownPayment}
                    onChange={(e) => updateRule('va', 'minDownPayment', parseFloat(e.target.value) || 0)}
                    className={inputClass}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Typically 0% for qualified veterans</p>
              </div>
              <div>
                <label className={labelClass}>Maximum LTV (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.va.maxLTV}
                    onChange={(e) => updateRule('va', 'maxLTV', parseFloat(e.target.value) || 100)}
                    className={inputClass}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Jumbo LTV */}
          <div className={sectionClass}>
            <h4 className="font-bold text-slate-800 mb-4 text-base">Jumbo</h4>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Minimum Down Payment (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.jumbo.minDownPayment}
                    onChange={(e) => updateRule('jumbo', 'minDownPayment', parseFloat(e.target.value) || 10)}
                    className={inputClass}
                    step="1"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Maximum LTV (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rules.jumbo.maxLTV}
                    onChange={(e) => updateRule('jumbo', 'maxLTV', parseFloat(e.target.value) || 90)}
                    className={inputClass}
                    step="1"
                    min="0"
                    max="100"
                  />
                  <span className="text-slate-500 font-semibold">%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Varies by lender (typically 80-90%)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
          ℹ️ How Validation Works
        </h4>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>Errors (Red):</strong> Hard limits that prevent loan approval (e.g., down payment below minimum)
          </p>
          <p>
            <strong>Warnings (Amber):</strong> Soft limits that may require additional review (e.g., DTI above 43%, unusual values)
          </p>
          <p>
            <strong>Updates:</strong> These settings apply to all new scenarios. Existing scenarios keep their validation at the time they were created.
          </p>
        </div>
      </div>

      {hasChanges && (
        <div className="fixed bottom-8 right-8 bg-amber-50 border-2 border-amber-300 rounded-lg px-6 py-3 shadow-xl">
          <p className="text-sm font-bold text-amber-900">⚠️ You have unsaved changes</p>
        </div>
      )}
    </div>
  );
};
