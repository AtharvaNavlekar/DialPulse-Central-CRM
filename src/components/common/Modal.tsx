import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#282820]/45 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full ${maxWidthClass} bg-[#FAF3ED] rounded-[20px] border border-[#CBB5A4] shadow-[0_16px_40px_rgba(40,40,32,0.18)] overflow-hidden transition-all duration-200 text-[#282820]`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#DFCBB9] bg-[#F5E9DF]">
            <div className="min-w-0 pr-3">
              <h3 className="text-base font-display font-bold text-[#282820] tracking-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-[#5C554D] font-mono mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-[#5C554D] hover:text-[#282820] p-1.5 rounded-[10px] hover:bg-[#E5C8B2]/70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22]"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[78vh] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
};
