import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'teal' | 'secondary' | 'outline' | 'slate' | 'amber' | 'rose' | 'emerald';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'sm',
  icon,
  className = '',
}) => {
  const variants = {
    primary: 'bg-[#00695C] text-white border-transparent',
    teal: 'bg-teal-50 text-[#00695C] border-teal-200/80',
    secondary: 'bg-[#CCE8E1] text-[#00201B] border-[#CCE8E1]',
    outline: 'bg-transparent text-slate-700 border-slate-300',
    slate: 'bg-slate-100 text-slate-800 border-slate-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  const sizes = {
    sm: 'text-[10px] px-2 py-0.5 rounded-lg font-mono font-medium',
    md: 'text-xs px-2.5 py-1 rounded-xl font-mono font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border tracking-tight uppercase select-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
