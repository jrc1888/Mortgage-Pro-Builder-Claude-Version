import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

// --- Helper Component for Comma-Separated Inputs ---
export interface FormattedNumberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
value: number;
  onChangeValue: (val: number) => void;
  isCurrency?: boolean;
  onBlur?: () => void;
}

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({ value, onChangeValue, isCurrency, className, onBlur, ...props }) => {
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
    // Remove all non-numeric characters except decimal point
    const clean = raw.replace(/[^0-9.]/g, '');
    
    // Prevent multiple dots
    if ((clean.match(/\./g) || []).length > 1) return;

    // Parse the number (before formatting with commas)
    const num = parseFloat(clean);
    if (!isNaN(num)) {
      // Round to 2 decimal places for dollar amounts
      const roundedNum = Math.round(num * 100) / 100;
      onChangeValue(roundedNum);
      // Format with commas as user types
      // Split by decimal point to handle formatting separately
      const parts = clean.split('.');
      const integerPart = parts[0] || '0';
      // Limit decimal part to 2 digits
      const decimalPart = parts[1] !== undefined ? '.' + parts[1].substring(0, 2) : '';
      
      // Add commas to integer part
      const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      setInputValue(formattedInteger + decimalPart);
    } else {
      onChangeValue(0);
      setInputValue(raw); // Keep raw input for display
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // On blur, re-format the valid number to 2 decimal places with commas
    const num = parseFloat(value.toString().replace(/,/g, ''));
    if (!isNaN(num)) {
      setInputValue(num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
        setInputValue('0.00');
    }
    // Call custom onBlur if provided (for undo/redo tracking)
    if (onBlur) {
      onBlur();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Keep commas when focused, but ensure the value is formatted
    const num = parseFloat(value.toString().replace(/,/g, ''));
    if (!isNaN(num)) {
      const parts = num.toString().split('.');
      const integerPart = parts[0] || '0';
      const decimalPart = parts[1] !== undefined ? '.' + parts[1] : '';
      const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      setInputValue(formattedInteger + decimalPart);
    }
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
    onBlur?: () => void;
    disabled?: boolean;
}> = ({ value, onChange, className, step = "0.01", placeholder, precision = 3, onBlur, disabled }) => {
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
            onBlur={() => {
              setFocused(false);
              if (onBlur) {
                onBlur();
              }
            }}
            onWheel={(e) => e.currentTarget.blur()}
            disabled={disabled}
            className={`bg-transparent outline-none w-full placeholder-slate-300 ${className} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            placeholder={placeholder}
        />
    );
};

// --- Custom Checkbox Component ---
export const CustomCheckbox = ({ checked, onChange, label, warning, className, disabled, labelClassName }: { checked: boolean, onChange: (c: boolean) => void, label?: React.ReactNode, warning?: string, className?: string, disabled?: boolean, labelClassName?: string }) => {
  // If label is already a React element, use it directly; otherwise wrap in span
  const labelElement = typeof label === 'string' || typeof label === 'number' 
    ? <span className={`text-sm font-semibold tracking-tight ${checked ? 'text-slate-900' : disabled ? 'text-slate-400' : 'text-slate-500 group-hover:text-slate-700'} ${labelClassName || ''}`}>{label}</span>
    : label;
  
  return (
    <div className={`flex flex-col ${className}`}>
        <div 
            onClick={() => !disabled && onChange(!checked)} 
            className={`flex items-center gap-2.5 select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer group'}`}
        >
            <div className={`w-5 h-5 rounded flex items-center justify-center transition-all border shadow-sm ${
                checked 
                ? 'bg-indigo-600 border-indigo-600' 
                : disabled
                ? 'bg-slate-100 border-slate-200'
                : 'bg-white border-slate-300 group-hover:border-indigo-400'
            }`}>
                {checked && <Check size={14} className="text-white" strokeWidth={3} />}
            </div>
            {labelElement}
        </div>
        {warning && checked && (
             <p className="text-[10px] text-amber-700 font-medium mt-1.5 ml-8 bg-amber-50 p-2 rounded border border-amber-100">
                {warning}
             </p>
        )}
    </div>
  );
};