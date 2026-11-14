import React, { useState, useEffect } from 'react';
import { ShieldCheck, Copy, Check, KeyRound, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { Button } from '../ui/Button.tsx';
import { api } from '../../app/api.ts';
import { MfaEnrollResponse } from '../../app/types.ts';

interface MfaEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled?: () => void;
}

export const MfaEnrollmentModal: React.FC<MfaEnrollmentModalProps> = ({
  isOpen,
  onClose,
  onEnrolled,
}) => {
  const [loadingEnroll, setLoadingEnroll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enrollData, setEnrollData] = useState<MfaEnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError(null);
    setSuccessMsg(null);
    setCode('');
    setLoadingEnroll(true);

    api
      .enrollMfa()
      .then((res) => {
        if (active) setEnrollData(res);
      })
      .catch((err: any) => {
        if (active) setError(err.message || 'Unable to initialize MFA enrollment.');
      })
      .finally(() => {
        if (active) setLoadingEnroll(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleCopySecret = () => {
    if (!enrollData?.secret) return;
    navigator.clipboard.writeText(enrollData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleCopyRecoveryCodes = () => {
    if (!enrollData?.recoveryCodes?.length) return;
    navigator.clipboard.writeText(enrollData.recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollData) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.verifyMfaEnrollment(
        code.trim(),
        enrollData.secret,
        enrollData.recoveryCodeHashes
      );
      setSuccessMsg(res.message || 'Two-factor authentication has been enabled.');
      if (onEnrolled) onEnrolled();
    } catch (err: any) {
      setError(err.message || 'Verification failed. Check your 6-digit authenticator code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Authenticator MFA Setup"
      subtitle="RFC 6238 TOTP & Single-Use Recovery Credentials"
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs text-slate-900">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-[12px] text-[#BA1A1A] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg ? (
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-[16px] space-y-3 text-emerald-900">
            <div className="flex items-center gap-2.5 font-display font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              <span>MFA Enrollment Confirmed</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">{successMsg}</p>
            <div className="pt-2 flex justify-end">
              <Button variant="filled" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : loadingEnroll ? (
          <div className="py-10 text-center text-slate-500 font-mono">
            Generating AES-256-GCM authenticator key and recovery codes...
          </div>
        ) : enrollData ? (
          <form onSubmit={handleVerify} className="space-y-4">
            {/* Step 1: Secret Key & URI */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-[14px] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-display font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-[#00695C]" />
                  <span>1. Add Secret to Authenticator App</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#00695C] hover:underline cursor-pointer"
                >
                  {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSecret ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-[10px] font-mono text-xs font-bold tracking-wider text-center select-all text-slate-900">
                {enrollData.secret}
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                Enter this Base32 key into Google Authenticator, 1Password, or Authy, or use the provisioning URI:
              </p>
              <div className="p-2 bg-slate-100 rounded-[8px] font-mono text-[10px] text-slate-600 break-all select-all">
                {enrollData.provisioningUri}
              </div>
            </div>

            {/* Step 2: Recovery Codes */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-[14px] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-display font-bold text-slate-900">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  <span>2. Store Single-Use Recovery Codes</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyRecoveryCodes}
                  className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#00695C] hover:underline cursor-pointer"
                >
                  {copiedCodes ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCodes ? 'Copied All' : 'Copy All'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-600">
                Only SHA-256 hashes are stored server-side. Save these backup codes in your password manager before confirming.
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                {enrollData.recoveryCodes.map((rc) => (
                  <div
                    key={rc}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-[8px] text-center font-semibold text-slate-900 tabular-nums"
                  >
                    {rc}
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3: Verify Initial TOTP */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                3. Enter 6-Digit Code to Activate
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full text-center tracking-[0.45em] text-xl font-mono py-2.5 px-4 rounded-[12px] border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:bg-white focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 transition-all"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <Button type="button" variant="outlined" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="filled"
                size="sm"
                loading={submitting}
                disabled={code.length !== 6}
              >
                <span>Activate MFA</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
};
