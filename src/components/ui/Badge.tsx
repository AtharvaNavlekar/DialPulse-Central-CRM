import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'green' | 'accent' | 'secondary' | 'outline' | 'oat' | 'amber' | 'rose' | 'emerald';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'oat',
  size = 'sm',
  icon,
  className = '',
}) => {
  const variants = {
    primary: 'bg-[#175E17] text-white border-transparent',
    green: 'bg-[#E6F2E6] text-[#175E17] border-[#228B22]/30',
    accent: 'bg-[#FF6347] text-[#282820] border-[#E65137]',
    secondary: 'bg-[#E5C8B2] text-[#282820] border-[#CBB5A4]',
    outline: 'bg-transparent text-[#282820] border-[#CBB5A4]',
    oat: 'bg-[#F5E9DF] text-[#5C554D] border-[#CBB5A4]',
    amber: 'bg-[#FEF3DF] text-[#8A4B08] border-[#E8C48B]',
    rose: 'bg-[#FDECEC] text-[#A61B1B] border-[#EAB5B5]',
    emerald: 'bg-[#E5F4E8] text-[#176B2A] border-[#A7D7B0]',
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
