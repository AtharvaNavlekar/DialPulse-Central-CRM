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
        return <AlertCircle className="w-6 h-6 text-amber-600" />;
      case 'infra':
        return <Cpu className="w-6 h-6 text-indigo-600" />;
      default:
        return <Inbox className="w-6 h-6 text-slate-400" />;
    }
  };

  const getBadgeClass = () => {
    switch (statusBadge) {
      case 'REAL':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'PARTIAL':
        return 'bg-teal-50 text-[#00695C] border-teal-300';
      case 'AWAITING CONNECTION':
        return 'bg-amber-50 text-amber-900 border-amber-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#F8FAF9]/80 rounded-2xl border border-dashed border-slate-300 text-center my-4">
      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-2xs border border-slate-200 mb-3">
        {renderIcon()}
      </div>

      <div className="mb-2">
        <span
          className={`text-[9px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-md border ${getBadgeClass()}`}
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
