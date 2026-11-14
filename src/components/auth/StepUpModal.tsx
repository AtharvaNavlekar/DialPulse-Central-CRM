import React, { useState } from 'react';
import { ShieldCheck, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { api } from '../../app/api.ts';

interface StepUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
}

export const StepUpModal: React.FC<StepUpModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Sensitive Platform Action',
}) => {
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRecoveryMode) {
        await api.submitStepUp(undefined, recoveryCode.trim());
      } else {
        await api.submitStepUp(code.trim(), undefined);
      }
      setCode('');
      setRecoveryCode('');
      onClose();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Step-up authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Step-Up Authentication Required"
      subtitle="15-Minute Elevated Privilege Window"
    >
      <div className="space-y-4">
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-[14px] flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-display font-bold block mb-0.5">Elevated Privilege Verification</span>
            <p>
              Authorizing <span className="font-semibold text-slate-900 font-mono">{actionTitle}</span> requires recent second-factor verification (valid for 15 minutes).
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-[12px] text-[#BA1A1A] text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRecoveryMode ? (
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                6-Digit Authenticator Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full text-center tracking-[0.4em] text-2xl font-mono py-2.5 px-4 rounded-[12px] border border-slate-200 focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 bg-slate-50 focus:bg-white text-slate-900 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                Enter your current TOTP code from your authenticator app
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Single-Use Recovery Code
              </label>
              <input
                type="text"
                autoFocus
                required
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 9))}
                placeholder="XXXX-XXXX"
                className="w-full text-center font-mono tracking-widest text-lg py-2.5 px-4 rounded-[12px] border border-slate-200 focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 bg-slate-50 focus:bg-white text-slate-900 transition-all"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                Enter an unconsumed 8-character recovery backup code
              </p>
            </div>
          )}

          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setIsRecoveryMode(!isRecoveryMode);
                setError(null);
              }}
              className="text-[#00695C] hover:underline text-xs flex items-center gap-1.5 font-semibold cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isRecoveryMode ? 'Use Authenticator App' : 'Use Recovery Code'}</span>
            </button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outlined"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="filled"
                size="sm"
                loading={loading}
                disabled={!isRecoveryMode ? code.length !== 6 : recoveryCode.length < 8}
              >
                <span>Authorize</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};
