import React, { useState } from 'react';
import { ArrowRight, AlertCircle, ShieldAlert, KeyRound, ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { Logo } from '../components/common/Logo.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Card } from '../components/ui/Card.tsx';

export const LoginPage: React.FC = () => {
  const { login, verifyMfaChallenge, verifyMfaRecovery, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // MFA Challenge State
  const [mfaChallenge, setMfaChallenge] = useState<{
    token: string;
    email: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    try {
      const res = await login(email, password);
      if ('mfaRequired' in res && res.mfaRequired) {
        setMfaChallenge({
          token: res.challengeToken,
          email: res.email,
        });
        setMfaCode('');
        setRecoveryCode('');
        setIsRecoveryMode(false);
        setRemainingAttempts(null);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Platform staff authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;

    setLoading(true);
    setLocalError(null);
    try {
      if (isRecoveryMode) {
        await verifyMfaRecovery(mfaChallenge.token, recoveryCode.trim());
      } else {
        await verifyMfaChallenge(mfaChallenge.token, mfaCode.trim());
      }
    } catch (err: any) {
      setLocalError(err.message || 'MFA verification failed');
      if (typeof err.remainingAttempts === 'number') {
        setRemainingAttempts(err.remainingAttempts);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setMfaChallenge(null);
    setMfaCode('');
    setRecoveryCode('');
    setLocalError(null);
    setRemainingAttempts(null);
  };

  const handleSelectEmail = (targetEmail: string) => {
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

        {/* Dynamic Card: Password Login vs MFA Challenge */}
        <Card variant="elevated" rounded="3xl" className="p-7 space-y-5">
          {(localError || authError) && (
            <div className="p-3 bg-red-50/90 border border-red-200 text-red-900 text-xs rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs leading-relaxed">{localError || authError}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <p className="text-[11px] text-red-700 mt-1 font-medium">
                    Remaining attempts before temporary lockout: {remainingAttempts}
                  </p>
                )}
              </div>
            </div>
          )}

          {!mfaChallenge ? (
            /* Standard Password Authentication */
            <>
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
            </>
          ) : (
            /* MFA Step-Up Verification */
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#00695C]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Two-Factor Authentication</h2>
                    <p className="text-[11px] text-slate-500 font-mono">{mfaChallenge.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <form onSubmit={handleMfaSubmit} className="space-y-4">
                {!isRecoveryMode ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      6-Digit Authenticator Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 px-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00695C] focus:border-transparent bg-white shadow-2xs"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                      Enter the current time-based code from your authenticator app
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Single-Use Recovery Code
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 9))}
                      placeholder="XXXX-XXXX"
                      className="w-full text-center font-mono tracking-widest text-lg py-3 px-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#00695C] focus:border-transparent bg-white shadow-2xs"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                      Enter one of your 8-character recovery backup codes
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="filled"
                  size="lg"
                  loading={loading}
                  className="w-full"
                  disabled={!isRecoveryMode ? mfaCode.length !== 6 : recoveryCode.length < 8}
                >
                  <span>{loading ? 'Verifying Factor...' : 'Verify & Enter Control Center'}</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </form>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(!isRecoveryMode);
                    setLocalError(null);
                  }}
                  className="text-[#00695C] hover:underline font-medium text-xs flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isRecoveryMode ? 'Use Authenticator Code' : 'Lost authenticator? Use recovery code'}</span>
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Security Compliance Footer */}
        <div className="text-center text-[11px] text-slate-500 font-mono">
          DialPulse Central CRM · Privileged Staff Access · Phase 01C Protected
        </div>
      </div>
    </div>
  );
};
