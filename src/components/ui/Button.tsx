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
      'inline-flex items-center justify-center font-semibold rounded-[12px] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF3ED] disabled:opacity-45 disabled:pointer-events-none relative overflow-hidden group select-none cursor-pointer whitespace-nowrap shrink-0';

    const variants = {
      filled:
        'bg-[#175E17] text-white border border-[#175E17] hover:bg-[#114711] hover:border-[#114711] shadow-[0_2px_8px_rgba(23,94,23,0.18)] active:scale-[0.98]',
      accent:
        'bg-[#FF6347] text-[#282820] border border-[#E65137] hover:bg-[#F25236] shadow-[0_2px_10px_rgba(255,99,71,0.22)] active:scale-[0.98]',
      tonal:
        'bg-[#E6F2E6] text-[#114711] border border-[#228B22]/30 hover:bg-[#D6EBD6] active:scale-[0.98]',
      elevated:
        'bg-[#FAF3ED] text-[#282820] border border-[#CBB5A4] shadow-[0_2px_8px_rgba(40,40,32,0.06)] hover:bg-[#F5E9DF] hover:border-[#B39B88] active:scale-[0.98]',
      outlined:
        'border border-[#CBB5A4] bg-[#F5E9DF]/65 hover:bg-[#ECD9C8] hover:border-[#B39B88] text-[#282820] active:scale-[0.98]',
      text:
        'bg-transparent text-[#175E17] hover:bg-[#228B22]/10 px-3',
      destructive:
        'bg-[#A61B1B] text-white border border-[#A61B1B] hover:bg-[#871414] shadow-[0_2px_8px_rgba(166,27,27,0.18)] active:scale-[0.98]',
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
        <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
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
            icon && <span className="shrink-0 flex items-center">{icon}</span>
          )}
          <span>{children}</span>
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
