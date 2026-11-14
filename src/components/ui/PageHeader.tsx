import React from 'react';

export interface PageHeaderProps {
  categoryTag?: string;
  categoryIcon?: React.ReactNode;
  title: string | React.ReactNode;
  description?: string | React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  categoryTag,
  categoryIcon,
  title,
  description,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 ${className}`}
    >
      <div>
        {categoryTag && (
          <div className="flex items-center gap-1.5 text-[#00695C] text-[11px] font-mono font-bold tracking-wider uppercase mb-1.5">
            {categoryIcon && <span className="shrink-0">{categoryIcon}</span>}
            <span>{categoryTag}</span>
          </div>
        )}

        <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight leading-tight">
          {title}
        </h1>

        {description && (
          <p className="mt-1.5 text-xs sm:text-[13px] text-slate-600 max-w-3xl leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};
