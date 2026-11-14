import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'teal' | 'accent' | 'secondary' | 'outline' | 'neutral' | 'amber' | 'rose' | 'emerald';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  icon,
  className = '',
}) => {
  const variants = {
    primary: 'bg-[#00695C] text-white border-transparent',
    teal: 'bg-teal-50 text-[#00695C] border-teal-200',
    accent: 'bg-[#00695C] text-white border-transparent',
    secondary: 'bg-slate-100 text-slate-800 border-slate-200',
    outline: 'bg-transparent text-slate-700 border-slate-300',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-red-50 text-[#BA1A1A] border-red-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  const sizes = {
    sm: 'text-[10px] px-2 py-0.5 rounded-[8px] font-mono font-semibold',
    md: 'text-xs px-2.5 py-1 rounded-[10px] font-mono font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border tracking-tight uppercase select-none whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
