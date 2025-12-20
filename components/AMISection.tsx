/**
 * Compact AMI Section Component
 * 
 * A more compact version of AMI lookup for the income tab
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Info, Users, MapPin } from 'lucide-react';
import { getAMILimits, getQualificationStatus, extractZipCode, formatZipCode, AMILimits, QualificationStatus } from '../services/amiService';
import { Scenario, CalculatedResults } from '../types';

interface AMISectionProps {
  scenario: Scenario;
  results: CalculatedResults;
}

export const AMISection: React.FC<AMISectionProps> = ({ scenario, results }) => {
  const [amiLimits, setAmiLimits] = useState<AMILimits | null>(null);
  const [qualification, setQualification] = useState<QualificationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract zip code from address
  const zipCode = extractZipCode(scenario.propertyAddress);
  
  // Calculate family size
  const familySize = (() => {
    let size = 0;
    if (scenario.income?.borrower1 > 0) size++;
    if (scenario.income?.borrower2 > 0) size++;
    return Math.max(1, size);
  })();

  // Calculate annual income
  const annualIncome = (() => {
    const monthly = (scenario.income?.borrower1 || 0) + 
                   (scenario.income?.borrower2 || 0) + 
                   (scenario.income?.other || 0);
    return monthly * 12;
  })();

  // Load AMI data when zip code or family size changes
  useEffect(() => {
    const formattedZip = zipCode ? formatZipCode(zipCode) : null;
    if (formattedZip && familySize >= 1 && familySize <= 8) {
      loadAMIData(formattedZip, familySize);
    } else {
      setAmiLimits(null);
      setQualification(null);
    }
  }, [zipCode, familySize]);

  // Update qualification when income changes
  useEffect(() => {
    if (zipCode && familySize >= 1 && familySize <= 8 && annualIncome > 0) {
      loadQualification(zipCode, familySize, annualIncome);
    } else {
      setQualification(null);
    }
  }, [zipCode, familySize, annualIncome]);

  const loadAMIData = async (zip: string, size: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const limits = await getAMILimits(zip, size);
      if (limits) {
        setAmiLimits(limits);
      } else {
        setAmiLimits(null);
        setError('AMI data not found for this zip code');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading AMI data');
      setAmiLimits(null);
    } finally {
      setLoading(false);
    }
  };

  const loadQualification = async (zip: string, size: number, income: number) => {
    try {
      const qual = await getQualificationStatus(zip, size, income);
      setQualification(qual);
    } catch (err) {
      console.error('Error loading qualification:', err);
    }
  };

  // Don't show if no zip code
  if (!zipCode) {
    return (
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mt-6">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600">
            <p className="font-semibold mb-1">Area Median Income (AMI) Lookup</p>
            <p>Enter a zip code or address with zip code in the property address field to view AMI limits.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Area Median Income (AMI)</h4>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin size={12} />
          <span className="font-semibold">{zipCode}</span>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="animate-spin text-indigo-500" size={16} />
          <span className="ml-2 text-xs text-slate-600">Loading AMI data...</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-900">{error}</p>
          </div>
        </div>
      )}

      {amiLimits && !loading && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {/* AMI Limits */}
          <div className="divide-y divide-slate-100">
            {[
              { label: 'Extremely Low', percent: '30%', value: amiLimits.limits.extremelyLow },
              { label: 'Very Low', percent: '50%', value: amiLimits.limits.veryLow },
              { label: 'Low', percent: '80%', value: amiLimits.limits.low },
              { label: 'AMI (100%)', percent: '100%', value: amiLimits.limits.median, highlight: true },
              { label: 'Moderate', percent: '120%', value: amiLimits.limits.moderate },
            ].map((item) => (
              <div
                key={item.percent}
                className={`px-3 py-2 flex items-center justify-between ${
                  item.highlight ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-600">{item.label}</span>
                  <span className="text-[10px] text-slate-400">({item.percent})</span>
                </div>
                <span className="text-xs font-bold text-slate-900">
                  ${item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>

          {/* Qualification Status */}
          {qualification && annualIncome > 0 && (
            <div className="bg-indigo-50 border-t border-indigo-100 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-indigo-900">Your Income:</span>
                <span className="text-xs font-bold text-indigo-900">
                  ${annualIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-indigo-700">Percentage of AMI:</span>
                <span className="text-xs font-bold text-indigo-700">
                  {qualification.percentageOfAMI}%
                </span>
              </div>
              {qualification.qualifiesFor.length > 0 && (
                <div className="mt-2 pt-2 border-t border-indigo-200">
                  <p className="text-[9px] font-semibold text-indigo-700 uppercase tracking-wide mb-1">
                    May Qualify For:
                  </p>
                  <ul className="space-y-0.5">
                    {qualification.qualifiesFor.slice(0, 3).map((program, idx) => (
                      <li key={idx} className="text-[9px] text-indigo-600 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-indigo-500" />
                        {program}
                      </li>
                    ))}
                    {qualification.qualifiesFor.length > 3 && (
                      <li className="text-[9px] text-indigo-600 italic">
                        +{qualification.qualifiesFor.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Geographic Info */}
          {(amiLimits.county || amiLimits.state) && (
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
              <p className="text-[9px] text-slate-500">
                {amiLimits.county && `${amiLimits.county}, `}{amiLimits.state}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

