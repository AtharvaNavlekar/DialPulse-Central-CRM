import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'elevated' | 'outlined' | 'text' | 'tonal' | 'destructive';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'filled',
      size = 'md',
      icon,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C] focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none relative overflow-hidden group select-none cursor-pointer';

    // M3 / DialPulse Variants
    const variants = {
      filled:
        'bg-[#00695C] text-white hover:bg-[#004D40] shadow-2xs hover:shadow-xs active:scale-[0.98]',
      tonal:
        'bg-[#CCE8E1] text-[#00201B] hover:bg-[#B2DFDB] active:scale-[0.98]',
      elevated:
        'bg-white text-slate-800 border border-slate-200 shadow-2xs hover:shadow-xs hover:bg-slate-50 active:scale-[0.98]',
      outlined:
        'border border-slate-300 bg-transparent hover:bg-slate-100/70 text-slate-800 active:scale-[0.98]',
      text:
        'bg-transparent text-[#00695C] hover:bg-teal-50/70 px-3',
      destructive:
        'bg-[#BA1A1A] text-white hover:bg-red-800 shadow-2xs hover:shadow-xs active:scale-[0.98]',
    };

    const sizes = {
      xs: 'h-7 px-2.5 text-xs gap-1.5',
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-xs font-semibold gap-2',
      lg: 'h-11 px-5 text-sm font-semibold gap-2.5',
    };

    const StateLayer = () => (
      <span className="absolute inset-0 bg-current opacity-0 group-hover:opacity-[0.06] group-active:opacity-[0.10] transition-opacity pointer-events-none" />
    );

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        <StateLayer />
        <span className="relative z-10 flex items-center gap-1.5">
          {loading ? (
            <svg
              className="animate-spin w-3.5 h-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            icon
          )}
          <span>{children}</span>
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
