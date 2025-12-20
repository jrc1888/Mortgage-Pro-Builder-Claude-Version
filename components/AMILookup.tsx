/**
 * AMI Lookup Component
 * 
 * Allows users to lookup Area Median Income limits by zip code and family size.
 * Displays AMI limits and qualification status based on income.
 */

import React, { useState, useEffect } from 'react';
import { Search, Loader2, AlertCircle, CheckCircle, Info, TrendingUp, Users, MapPin, Calendar } from 'lucide-react';
import { getAMILimits, getQualificationStatus, extractZipCode, isValidZipCode, formatZipCode, AMILimits, QualificationStatus } from '../services/amiService';
import { useToast } from '../hooks/useToast';

interface AMILookupProps {
  /** Optional initial zip code (e.g., extracted from property address) */
  initialZipCode?: string;
  /** Optional initial family size */
  initialFamilySize?: number;
  /** Optional annual income for qualification check */
  annualIncome?: number;
  /** Callback when zip code is found/entered */
  onZipCodeFound?: (zipCode: string) => void;
}

export const AMILookup: React.FC<AMILookupProps> = ({
  initialZipCode,
  initialFamilySize = 1,
  annualIncome,
  onZipCodeFound,
}) => {
  const { addToast } = useToast();
  const [zipCode, setZipCode] = useState(initialZipCode || '');
  const [familySize, setFamilySize] = useState(initialFamilySize);
  const [income, setIncome] = useState(annualIncome?.toString() || '');
  const [amiLimits, setAmiLimits] = useState<AMILimits | null>(null);
  const [qualification, setQualification] = useState<QualificationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load AMI data when zip code or family size changes
  useEffect(() => {
    const formattedZip = formatZipCode(zipCode);
    if (formattedZip && familySize >= 1 && familySize <= 8) {
      loadAMIData(formattedZip, familySize);
    } else {
      setAmiLimits(null);
      setQualification(null);
    }
  }, [zipCode, familySize]);

  // Update qualification when income changes
  useEffect(() => {
    const formattedZip = formatZipCode(zipCode);
    const incomeNum = parseFloat(income.replace(/[^0-9.]/g, ''));
    
    if (formattedZip && familySize >= 1 && familySize <= 8 && incomeNum > 0) {
      loadQualification(formattedZip, familySize, incomeNum);
    } else {
      setQualification(null);
    }
  }, [zipCode, familySize, income]);

  const loadAMIData = async (zip: string, size: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const limits = await getAMILimits(zip, size);
      if (limits) {
        setAmiLimits(limits);
        if (onZipCodeFound) {
          onZipCodeFound(zip);
        }
      } else {
        setAmiLimits(null);
        setError('AMI data not found for this zip code. Data may not be available yet.');
        addToast({
          type: 'error',
          message: 'AMI data not found for this zip code',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Error loading AMI data');
      setAmiLimits(null);
      addToast({
        type: 'error',
        message: err.message || 'Error loading AMI data',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadQualification = async (zip: string, size: number, annualIncome: number) => {
    try {
      const qual = await getQualificationStatus(zip, size, annualIncome);
      setQualification(qual);
    } catch (err) {
      console.error('Error loading qualification:', err);
    }
  };

  const handleZipCodeChange = (value: string) => {
    // Allow only digits and format as user types
    const digits = value.replace(/\D/g, '').substring(0, 5);
    setZipCode(digits);
  };

  const handleIncomeChange = (value: string) => {
    // Allow numbers, decimals, and commas
    setIncome(value);
  };

  const incomeValue = parseFloat(income.replace(/[^0-9.]/g, '')) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Area Median Income Lookup</h3>
        <p className="text-sm text-slate-600">
          Enter zip code and family size to view AMI limits and qualification information
        </p>
      </div>

      {/* Input Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Zip Code Input */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">
            Zip Code
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MapPin size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => handleZipCodeChange(e.target.value)}
              placeholder="12345"
              maxLength={5}
              className="w-full pl-9 pr-4 h-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Family Size Input */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">
            Family Size
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Users size={16} className="text-slate-400" />
            </div>
            <select
              value={familySize}
              onChange={(e) => setFamilySize(parseInt(e.target.value))}
              className="w-full pl-9 pr-4 h-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((size) => (
                <option key={size} value={size}>
                  {size} {size === 1 ? 'Person' : 'Persons'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Income Input (Optional) */}
      {amiLimits && (
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-0.5">
            Annual Household Income (Optional)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <TrendingUp size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              value={income}
              onChange={(e) => handleIncomeChange(e.target.value)}
              placeholder="Enter annual income for qualification check"
              className="w-full pl-9 pr-4 h-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-indigo-500" size={24} />
          <span className="ml-2 text-sm text-slate-600">Loading AMI data...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-medium text-red-900">{error}</p>
            <p className="text-xs text-red-700 mt-1">
              AMI data may not be available for all zip codes. Data is typically available at the county or MSA level.
            </p>
          </div>
        </div>
      )}

      {/* AMI Limits Display */}
      {amiLimits && !loading && (
        <div className="space-y-4">
          {/* Geographic Info */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {amiLimits.county && (
                <div>
                  <span className="text-slate-500 text-xs">County</span>
                  <p className="font-semibold text-slate-900">{amiLimits.county}</p>
                </div>
              )}
              {amiLimits.msa && (
                <div>
                  <span className="text-slate-500 text-xs">MSA</span>
                  <p className="font-semibold text-slate-900">{amiLimits.msa}</p>
                </div>
              )}
              {amiLimits.state && (
                <div>
                  <span className="text-slate-500 text-xs">State</span>
                  <p className="font-semibold text-slate-900">{amiLimits.state}</p>
                </div>
              )}
              <div>
                <span className="text-slate-500 text-xs">Effective Date</span>
                <p className="font-semibold text-slate-900 flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(amiLimits.effectiveDate).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* AMI Limits Table */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100">
              <h4 className="font-bold text-sm text-indigo-900">Income Limits by Category</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { label: 'Extremely Low Income', percent: '30%', value: amiLimits.limits.extremelyLow, color: 'red' },
                { label: 'Very Low Income', percent: '50%', value: amiLimits.limits.veryLow, color: 'orange' },
                { label: 'Low Income', percent: '80%', value: amiLimits.limits.low, color: 'yellow' },
                { label: 'Area Median Income (AMI)', percent: '100%', value: amiLimits.limits.median, color: 'indigo', highlight: true },
                { label: 'Moderate Income', percent: '120%', value: amiLimits.limits.moderate, color: 'green' },
              ].map((item) => (
                <div
                  key={item.percent}
                  className={`px-4 py-3 flex items-center justify-between ${
                    item.highlight ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-${item.color}-500`} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.percent} of AMI</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    ${item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Qualification Status */}
          {qualification && incomeValue > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-slate-900 mb-1">Qualification Status</h4>
                  <p className="text-xs text-slate-600">
                    Your income is <span className="font-semibold">{qualification.percentageOfAMI}%</span> of the Area Median Income
                  </p>
                </div>
              </div>

              {qualification.qualifiesFor.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    You May Qualify For:
                  </p>
                  <ul className="space-y-1">
                    {qualification.qualifiesFor.map((program, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        {program}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Your income exceeds the moderate income threshold. You may still qualify for conventional loan programs.
                </p>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={16} />
            <div className="text-xs text-blue-900">
              <p className="font-semibold mb-1">Data Disclaimer</p>
              <p>
                AMI limits are provided for informational purposes only. Actual program eligibility may vary.
                Data source: {amiLimits.dataSource}. Always verify current limits with official sources.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

