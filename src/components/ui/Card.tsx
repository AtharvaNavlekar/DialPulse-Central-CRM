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
    lg: 'rounded-[14px]',
    xl: 'rounded-[18px]',
    '2xl': 'rounded-[18px]',
    '3xl': 'rounded-[22px]',
  }[rounded];

  const variants = {
    default:
      'bg-white border border-slate-200 shadow-xs text-slate-900',
    elevated:
      'bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 text-slate-900',
    subtle:
      'bg-slate-50 border border-slate-200/80 text-slate-900',
    accent:
      'bg-teal-50/70 border border-teal-200 text-[#004D40]',
    warning:
      'bg-amber-50 border border-amber-200 text-amber-900',
    error:
      'bg-red-50 border border-red-200 text-red-900',
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
      className={`p-5 rounded-[18px] bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition-all duration-200 flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:shadow-sm' : ''
      } ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            {tag || label}
          </span>
          {icon && (
            <div className="w-8 h-8 rounded-[10px] bg-teal-50 text-[#00695C] border border-teal-200/80 flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          {value !== null ? (
            <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900 tracking-tight tabular-nums">
              {value}
            </span>
          ) : (
            statusBadge || (
              <span className="text-xs font-mono font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-[8px]">
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
