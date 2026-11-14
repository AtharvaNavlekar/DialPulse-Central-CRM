import React from 'react';
import { Database, AlertCircle, Inbox, ShieldAlert, Cpu } from 'lucide-react';
import { Button } from '../ui/Button.tsx';

interface EmptyStateProps {
  title: string;
  description: string;
  statusBadge?: 'REAL' | 'PARTIAL' | 'NOT CONFIGURED' | 'AWAITING CONNECTION' | 'EMPTY';
  iconType?: 'database' | 'empty' | 'alert' | 'security' | 'infra';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  statusBadge = 'NOT CONFIGURED',
  iconType = 'empty',
  action,
}) => {
  const renderIcon = () => {
    switch (iconType) {
      case 'database':
        return <Database className="w-6 h-6 text-[#00695C]" />;
      case 'security':
        return <ShieldAlert className="w-6 h-6 text-[#BA1A1A]" />;
      case 'alert':
        return <AlertCircle className="w-6 h-6 text-amber-700" />;
      case 'infra':
        return <Cpu className="w-6 h-6 text-[#00695C]" />;
      default:
        return <Inbox className="w-6 h-6 text-slate-400" />;
    }
  };

  const getBadgeClass = () => {
    switch (statusBadge) {
      case 'REAL':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'PARTIAL':
        return 'bg-teal-50 text-[#00695C] border-teal-200';
      case 'AWAITING CONNECTION':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-50/70 rounded-[18px] border border-dashed border-slate-300 text-center my-4 mx-4">
      <div className="w-12 h-12 rounded-[14px] bg-white flex items-center justify-center shadow-xs border border-slate-200 mb-3">
        {renderIcon()}
      </div>

      <div className="mb-2">
        <span
          className={`text-[10px] uppercase font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-[8px] border ${getBadgeClass()}`}
        >
          {statusBadge}
        </span>
      </div>

      <h4 className="text-sm sm:text-base font-display font-bold text-slate-900 mb-1">
        {title}
      </h4>
      <p className="text-xs text-slate-600 max-w-md mb-4 leading-relaxed font-sans">
        {description}
      </p>

      {action && (
        <Button
          variant="filled"
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
};
