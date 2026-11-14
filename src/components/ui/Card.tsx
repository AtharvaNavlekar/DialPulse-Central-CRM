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
      'bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_4px_18px_rgba(40,40,32,0.08)] text-[#282820]',
    elevated:
      'bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_8px_24px_rgba(40,40,32,0.10)] hover:shadow-[0_10px_28px_rgba(40,40,32,0.12)] transition-shadow duration-200 text-[#282820]',
    subtle:
      'bg-[#F5E9DF] border border-[#DFCBB9] text-[#282820]',
    accent:
      'bg-[#E6F2E6] border border-[#228B22]/35 text-[#114711]',
    warning:
      'bg-[#FEF3DF] border border-[#E8C48B] text-[#6F3B05]',
    error:
      'bg-[#FDECEC] border border-[#EAB5B5] text-[#7E1414]',
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
      className={`p-5 rounded-[18px] bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_4px_18px_rgba(40,40,32,0.08)] hover:border-[#B39B88] transition-all duration-200 flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:shadow-[0_8px_24px_rgba(40,40,32,0.12)]' : ''
      } ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C554D]">
            {tag || label}
          </span>
          {icon && (
            <div className="w-8 h-8 rounded-[10px] bg-[#E6F2E6] text-[#175E17] border border-[#228B22]/25 flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          {value !== null ? (
            <span className="text-2xl sm:text-3xl font-extrabold font-display text-[#282820] tracking-tight tabular-nums">
              {value}
            </span>
          ) : (
            statusBadge || (
              <span className="text-xs font-mono font-medium text-[#8A4B08] bg-[#FEF3DF] border border-[#E8C48B] px-2 py-0.5 rounded-[8px]">
                NO DATA
              </span>
            )
          )}
          {secondary && (
            <span className="text-xs font-mono text-[#5C554D]">{secondary}</span>
          )}
        </div>
      </div>

      {footer && (
        <div className="mt-4 pt-3 border-t border-[#DFCBB9] flex items-center justify-between text-xs text-[#5C554D]">
          {footer}
        </div>
      )}
    </div>
  );
};
