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
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 my-3 bg-[#FDECEC] border border-[#EAB5B5] rounded-[18px] text-[#7E1414] shadow-[0_4px_14px_rgba(166,27,27,0.08)]"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-[#A61B1B] shrink-0 mt-0.5" />
        <div>
          <h5 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A61B1B]">
            {title}
          </h5>
          <p className="text-xs mt-0.5 text-[#282820] leading-relaxed">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button
          variant="outlined"
          size="xs"
          onClick={onRetry}
          icon={<RotateCcw className="w-3 h-3 text-[#A61B1B]" />}
          className="border-[#EAB5B5] bg-[#FAF3ED] text-[#A61B1B] hover:bg-[#FDECEC] shrink-0 self-start sm:self-auto"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
