import React, { useState } from 'react';
import { Lock, ArrowRight, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { Logo } from '../components/common/Logo.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Card } from '../components/ui/Card.tsx';

export const LoginPage: React.FC = () => {
  const { login, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setLocalError(err.message || 'Platform staff authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmail = (targetEmail: string) => {
    // Convenience selection only: never prefill a password or expose a credential in frontend code.
    setEmail(targetEmail);
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center items-center p-4 selection:bg-teal-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header with DialPulse Logo */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Logo size="lg" variant="light" showSubtitle={true} />
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono pt-1">
            <span>Privileged Internal Environment</span>
            <span>·</span>
            <span className="text-[#00695C] font-semibold">Tier-1 Access</span>
          </div>
        </div>

        {/* Security Boundary Warning Card */}
        <div className="p-3.5 bg-red-50/90 border border-red-200/90 rounded-2xl text-red-950 text-xs flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#BA1A1A] font-mono">
              // Restricted Platform Boundary
            </span>
            <p className="mt-0.5 text-slate-700 text-[11px] leading-relaxed">
              Exclusively for authorized DialPulse platform staff. Customer tenant accounts (owners, TLs, telecallers) have zero access here.
            </p>
          </div>
        </div>

        {/* Login Form Box */}
        <Card variant="elevated" rounded="3xl" className="p-7 space-y-5">
          {(localError || authError) && (
            <div className="p-3 bg-red-50/90 border border-red-200 text-red-900 text-xs rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
              <span className="text-xs leading-relaxed">{localError || authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Platform Staff Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@dialpulse.internal"
              helperText="Requires an active, authorized platform staff identity"
            />

            <Input
              label="Staff Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Verified against a server-side password hash"
            />

            <Button
              type="submit"
              variant="filled"
              size="lg"
              loading={loading}
              className="w-full"
            >
              <span>{loading ? 'Verifying Platform Staff...' : 'Access Control Center'}</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>

          {/* Development Staff Quick Select Options */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">
              // Platform Staff Identities
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectEmail('admin@dialpulse.internal')}
                className="w-full py-2 px-3 rounded-xl bg-[#F8FAF9] hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between text-xs text-slate-800 transition-colors group cursor-pointer"
              >
                <div>
                  <span className="font-semibold text-slate-900">admin@dialpulse.internal</span>
                  <span className="text-[10px] font-mono text-slate-500 ml-1.5">· platform_admin</span>
                </div>
                <span className="text-[11px] font-mono text-[#00695C] font-semibold group-hover:underline">Select</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEmail('support@dialpulse.internal')}
                className="w-full py-2 px-3 rounded-xl bg-[#F8FAF9] hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between text-xs text-slate-800 transition-colors group cursor-pointer"
              >
                <div>
                  <span className="font-semibold text-slate-900">support@dialpulse.internal</span>
                  <span className="text-[10px] font-mono text-slate-500 ml-1.5">· platform_support</span>
                </div>
                <span className="text-[11px] font-mono text-[#00695C] font-semibold group-hover:underline">Select</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEmail('security@dialpulse.internal')}
                className="w-full py-2 px-3 rounded-xl bg-[#F8FAF9] hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between text-xs text-slate-800 transition-colors group cursor-pointer"
              >
                <div>
                  <span className="font-semibold text-slate-900">security@dialpulse.internal</span>
                  <span className="text-[10px] font-mono text-slate-500 ml-1.5">· platform_security</span>
                </div>
                <span className="text-[11px] font-mono text-[#00695C] font-semibold group-hover:underline">Select</span>
              </button>
            </div>
          </div>
        </Card>

        {/* Security Compliance Footer */}
        <div className="text-center text-[11px] text-slate-500 font-mono">
          DialPulse Central CRM · Privileged Staff Access · Security Hardening in Progress
        </div>
      </div>
    </div>
  );
};
