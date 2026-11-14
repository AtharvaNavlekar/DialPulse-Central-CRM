import React from 'react';
import { Search, X } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-[#282820] tracking-tight"
          >
            {label}
            {props.required && <span className="text-[#A61B1B] ml-0.5">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-[#6E665D] pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-[#F5E9DF] text-[#282820] placeholder:text-[#84796D] border rounded-[12px] px-3.5 py-2.5 text-xs transition-all duration-200 focus:outline-none focus:bg-[#FAF3ED] ${
              error
                ? 'border-[#A61B1B] focus:border-[#A61B1B] focus:ring-2 focus:ring-[#A61B1B]/20'
                : 'border-[#CBB5A4] focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20'
            } ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} ${className}`}
            {...props}
          />

          {rightIcon && (
            <div className="absolute right-3 text-[#6E665D] flex items-center">
              {rightIcon}
            </div>
          )}
        </div>

        {error ? (
          <p className="text-[11px] text-[#A61B1B] font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-[11px] text-[#5C554D]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  onClear,
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-3.5 h-3.5 text-[#6E665D] absolute left-3 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-xs text-[#282820] bg-[#F5E9DF] border border-[#CBB5A4] rounded-[12px] focus:outline-none focus:bg-[#FAF3ED] focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20 transition-all duration-200 font-sans placeholder:text-[#84796D]"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute right-2.5 p-0.5 text-[#5C554D] hover:text-[#282820] rounded-full hover:bg-[#E5C8B2]/70 transition-colors cursor-pointer"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
