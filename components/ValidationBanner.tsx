import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ValidationError } from '../services/validation';

interface Props {
  errors: ValidationError[];
  onDismiss?: () => void;
}

// Diverse light colors for each warning box
const warningColors = [
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'text-amber-600', title: 'text-amber-900', close: 'text-amber-400 hover:text-amber-600' },
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'text-blue-600', title: 'text-blue-900', close: 'text-blue-400 hover:text-blue-600' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', icon: 'text-purple-600', title: 'text-purple-900', close: 'text-purple-400 hover:text-purple-600' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800', icon: 'text-pink-600', title: 'text-pink-900', close: 'text-pink-400 hover:text-pink-600' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', icon: 'text-teal-600', title: 'text-teal-900', close: 'text-teal-400 hover:text-teal-600' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', icon: 'text-indigo-600', title: 'text-indigo-900', close: 'text-indigo-400 hover:text-indigo-600' },
];

// Extract short label from warning message
const getWarningLabel = (message: string): string => {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('down payment')) {
    return 'Down Payment';
  }
  if (lowerMessage.includes('ltv')) {
    return 'LTV';
  }
  if (lowerMessage.includes('front-end') || lowerMessage.includes('front end')) {
    return 'DTI Front';
  }
  if (lowerMessage.includes('back-end') || lowerMessage.includes('back end')) {
    return 'DTI Back';
  }
  if (lowerMessage.includes('interest rate') || lowerMessage.includes('rate')) {
    return 'Rate';
  }
  if (lowerMessage.includes('credit score') || lowerMessage.includes('credit')) {
    return 'Credit';
  }
  if (lowerMessage.includes('loan amount') || lowerMessage.includes('loan limit')) {
    return 'Loan Amount';
  }
  // Default to first few words if no match
  const words = message.split(' ');
  if (words.length >= 2) {
    return words.slice(0, 2).join(' ');
  }
  return words[0] || 'Warning';
};

export const ValidationBanner: React.FC<Props> = ({ errors, onDismiss }) => {
  if (errors.length === 0) return null;

  // Treat all errors as warnings
  const allWarnings = errors;

  if (allWarnings.length === 0) return null;

  return (
    <div className="mb-6 animate-fadeIn">
      <div className="grid grid-cols-2 gap-3">
        {allWarnings.map((warning, idx) => {
          const colors = warningColors[idx % warningColors.length];
          const label = getWarningLabel(warning.message);
          return (
            <div key={idx} className={`${colors.bg} border-2 ${colors.border} rounded-xl p-2 shadow-sm`}>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${colors.icon} shrink-0`} />
                  <h4 className={`font-bold ${colors.title} text-sm`}>
                    Warning: <span className="font-semibold">{label}</span>
                  </h4>
                </div>
                {onDismiss && (
                  <button
                    onClick={onDismiss}
                    className={`${colors.close} transition-colors`}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <p className={`text-xs ${colors.text} leading-relaxed`}>
                {warning.message}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
