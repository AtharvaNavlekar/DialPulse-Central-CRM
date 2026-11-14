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
        return <Database className="w-6 h-6 text-[#175E17]" />;
      case 'security':
        return <ShieldAlert className="w-6 h-6 text-[#A61B1B]" />;
      case 'alert':
        return <AlertCircle className="w-6 h-6 text-[#8A4B08]" />;
      case 'infra':
        return <Cpu className="w-6 h-6 text-[#175E17]" />;
      default:
        return <Inbox className="w-6 h-6 text-[#5C554D]" />;
    }
  };

  const getBadgeClass = () => {
    switch (statusBadge) {
      case 'REAL':
        return 'bg-[#E5F4E8] text-[#114E1E] border-[#A7D7B0]';
      case 'PARTIAL':
        return 'bg-[#E6F2E6] text-[#175E17] border-[#228B22]/35';
      case 'AWAITING CONNECTION':
        return 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B]';
      default:
        return 'bg-[#ECD9C8] text-[#5C554D] border-[#CBB5A4]';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#F5E9DF]/80 rounded-[18px] border border-dashed border-[#CBB5A4] text-center my-4 mx-4">
      <div className="w-12 h-12 rounded-[14px] bg-[#FAF3ED] flex items-center justify-center shadow-[0_2px_8px_rgba(40,40,32,0.06)] border border-[#CBB5A4] mb-3">
        {renderIcon()}
      </div>

      <div className="mb-2">
        <span
          className={`text-[10px] uppercase font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-[8px] border ${getBadgeClass()}`}
        >
          {statusBadge}
        </span>
      </div>

      <h4 className="text-sm sm:text-base font-display font-bold text-[#282820] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[#5C554D] max-w-md mb-4 leading-relaxed font-sans">
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
