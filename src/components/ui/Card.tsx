import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'subtle' | 'accent' | 'warning' | 'error';
  rounded?: 'lg' | 'xl' | '2xl' | '3xl';
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  rounded = '2xl',
  className = '',
  children,
  ...props
}) => {
  const roundedClass = {
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
  }[rounded];

  const variants = {
    default: 'bg-white border border-slate-200/90 shadow-2xs',
    elevated: 'bg-white border border-slate-200 shadow-xs hover:shadow-sm transition-shadow',
    subtle: 'bg-[#F8FAF9] border border-slate-200/70',
    accent: 'bg-teal-50/40 border border-[#00695C]/25 text-[#00201B]',
    warning: 'bg-amber-50/70 border border-amber-200 text-amber-950',
    error: 'bg-red-50/70 border border-red-200 text-red-950',
  };

  return (
    <div
      className={`${roundedClass} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface MetricCardProps {
  label: string;
  value: string | number | null;
  secondary?: string;
  icon?: React.ReactNode;
  tag?: string;
  statusBadge?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  secondary,
  icon,
  tag,
  statusBadge,
  footer,
  onClick,
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:shadow-xs' : ''
      } ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            {tag ? `// ${tag}` : label}
          </span>
          {icon && (
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#00695C] border border-teal-100 flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          {value !== null ? (
            <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900 tracking-tight">
              {value}
            </span>
          ) : (
            statusBadge || (
              <span className="text-xs font-mono font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                NO DATA
              </span>
            )
          )}
          {secondary && (
            <span className="text-xs font-mono text-slate-500">{secondary}</span>
          )}
        </div>
      </div>

      {footer && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
};
