import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'accent' | 'elevated' | 'outlined' | 'text' | 'tonal' | 'destructive';
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
    const baseStyles =
      'inline-flex items-center justify-center font-semibold rounded-[12px] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-45 disabled:pointer-events-none relative overflow-hidden group select-none cursor-pointer whitespace-nowrap shrink-0';

    const variants = {
      filled:
        'bg-[#00695C] text-white border border-[#00695C] hover:bg-[#004D40] hover:border-[#004D40] shadow-xs active:scale-[0.98]',
      accent:
        'bg-[#00695C] text-white border border-[#00695C] hover:bg-[#004D40] hover:border-[#004D40] shadow-xs active:scale-[0.98]',
      tonal:
        'bg-[#CCE8E1]/60 text-[#004D40] border border-[#00695C]/25 hover:bg-[#CCE8E1] active:scale-[0.98]',
      elevated:
        'bg-white text-slate-800 border border-slate-200 shadow-xs hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]',
      outlined:
        'border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 active:scale-[0.98]',
      text:
        'bg-transparent text-[#00695C] hover:bg-teal-50 px-3',
      destructive:
        'bg-[#BA1A1A] text-white border border-[#BA1A1A] hover:bg-red-800 shadow-xs active:scale-[0.98]',
    };

    const sizes = {
      xs: 'h-8 px-3 text-xs gap-1.5',
      sm: 'h-9 px-3.5 text-xs gap-1.5',
      md: 'h-10 px-4 text-xs gap-2',
      lg: 'h-11 px-5 text-sm gap-2',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        <span className="relative z-10 inline-flex items-center justify-center gap-2 whitespace-nowrap">
          {loading ? (
            <svg
              className="animate-spin w-3.5 h-3.5 shrink-0"
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
            icon && <span className="shrink-0 inline-flex items-center">{icon}</span>
          )}
          <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
            {children}
          </span>
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
