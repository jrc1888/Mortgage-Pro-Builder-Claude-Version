import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

// --- Helper Component for Comma-Separated Inputs ---
export interface FormattedNumberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: number;
  onChangeValue: (val: number) => void;
  isCurrency?: boolean;
}

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({ value, onChangeValue, isCurrency, className, ...props }) => {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Sync internal text state with external number prop when not focused
  useEffect(() => {
    if (!isFocused) {
        // Show 0.00 explicitly if value is 0, instead of empty string or just 0
        setInputValue(value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits and one dot
    const clean = raw.replace(/[^0-9.]/g, '');
    
    // Prevent multiple dots
    if ((clean.match(/\./g) || []).length > 1) return;

    setInputValue(raw); // Keep user input as they type (including commas if they type them)
    
    // Parse for parent
    const num = parseFloat(clean);
    if (!isNaN(num)) {
      onChangeValue(num);
    } else {
      onChangeValue(0);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // On blur, re-format the valid number to 2 decimal places
    const num = parseFloat(inputValue.replace(/,/g, ''));
    if (!isNaN(num)) {
      setInputValue(num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
        setInputValue('0.00');
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    // On focus, remove commas for easier editing
    setInputValue(inputValue.replace(/,/g, ''));
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur();
  };

  return (
    <input
      type="text"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onWheel={handleWheel}
      // Combine passed class with base reset styles to ensure it fits in containers
      className={`bg-transparent outline-none w-full placeholder-slate-300 ${className}`}
      {...props}
    />
  );
};

// --- Live Decimal Input (For Percentages like MI, Rate) ---
export const LiveDecimalInput: React.FC<{
    value: number; 
    onChange: (val: number) => void; 
    className?: string;
    step?: string;
    placeholder?: string;
    precision?: number;
}> = ({ value, onChange, className, step = "0.01", placeholder, precision = 3 }) => {
    const [localVal, setLocalVal] = useState(value.toString());
    const [focused, setFocused] = useState(false);

    // Sync from parent when not focused to respect external calculations
    useEffect(() => {
        if (!focused) {
            // Force the specific precision (e.g. 6.500)
            // If the value is 0, we can show 0 or 0.000 based on preference, but toFixed is safe
            setLocalVal(value.toFixed(precision)); 
        }
    }, [value, focused, precision]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const str = e.target.value;
        setLocalVal(str);
        
        const num = parseFloat(str);
        if (!isNaN(num)) {
            onChange(num);
        }
    };

    return (
        <input
            type="number"
            step={step}
            value={localVal}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onWheel={(e) => e.currentTarget.blur()}
            className={`bg-transparent outline-none w-full placeholder-slate-300 ${className}`}
            placeholder={placeholder}
        />
    );
};

// --- Custom Checkbox Component ---
export const CustomCheckbox = ({ checked, onChange, label, warning, className }: { checked: boolean, onChange: (c: boolean) => void, label?: React.ReactNode, warning?: string, className?: string }) => (
  <div className={`flex flex-col ${className}`}>
      <div 
          onClick={() => onChange(!checked)} 
          className="flex items-center gap-2.5 cursor-pointer group select-none"
      >
          <div className={`w-5 h-5 rounded flex items-center justify-center transition-all border shadow-sm ${
              checked 
              ? 'bg-indigo-600 border-indigo-600' 
              : 'bg-white border-slate-300 group-hover:border-indigo-400'
          }`}>
              {checked && <Check size={14} className="text-white" strokeWidth={3} />}
          </div>
          {label && <span className={`text-sm font-semibold tracking-tight ${checked ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>{label}</span>}
      </div>
      {warning && checked && (
           <p className="text-[10px] text-amber-700 font-medium mt-1.5 ml-8 bg-amber-50 p-2 rounded border border-amber-100">
              {warning}
           </p>
      )}
  </div>
);