import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button.tsx';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  title?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onRetry,
  title = 'Platform Operation Notice',
}) => {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 my-3 bg-red-50 border border-red-200 rounded-[18px] text-red-900 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[#BA1A1A] shrink-0 mt-0.5" />
        <div>
          <h5 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#BA1A1A]">
            {title}
          </h5>
          <p className="text-xs mt-0.5 text-slate-800 leading-relaxed">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button
          variant="outlined"
          size="xs"
          onClick={onRetry}
          icon={<RotateCcw className="w-3 h-3 text-[#BA1A1A]" />}
          className="border-red-200 bg-white text-[#BA1A1A] hover:bg-red-50 shrink-0 self-start sm:self-auto"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
