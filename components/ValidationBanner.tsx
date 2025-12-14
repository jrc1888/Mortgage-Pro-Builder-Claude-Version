import React from 'react';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';
import { ValidationError } from '../services/validation';

interface Props {
  errors: ValidationError[];
  onDismiss?: () => void;
}

export const ValidationBanner: React.FC<Props> = ({ errors, onDismiss }) => {
  if (errors.length === 0) return null;

  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  return (
    <div className="space-y-3 mb-6 animate-fadeIn">
      {/* Errors */}
      {errorCount > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <h4 className="font-bold text-red-900">
                {errorCount} Error{errorCount > 1 ? 's' : ''} Found
              </h4>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {errors
              .filter(e => e.severity === 'error')
              .map((error, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-red-800">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span className="flex-1">{error.message}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {warningCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <h4 className="font-bold text-amber-900">
                {warningCount} Warning{warningCount > 1 ? 's' : ''}
              </h4>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-amber-400 hover:text-amber-600 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {errors
              .filter(e => e.severity === 'warning')
              .map((error, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span className="flex-1">{error.message}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};
