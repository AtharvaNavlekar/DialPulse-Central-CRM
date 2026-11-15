import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, ShieldAlert, KeyRound, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { PLATFORM_ROUTES } from '../app/routes.ts';
import { Logo } from '../components/common/Logo.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Card } from '../components/ui/Card.tsx';

export const LoginPage: React.FC = () => {
  const { login, verifyMfaChallenge, verifyMfaRecovery } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cookieBlockedError, setCookieBlockedError] = useState(false);

  // MFA Challenge State
  const [mfaChallenge, setMfaChallenge] = useState<{
    token: string;
    email: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  const [showEmailDirectory, setShowEmailDirectory] = useState(false);

  const staffIdentities = [
    { label: 'Admin', email: 'admin@dialpulse.internal', role: 'platform_admin' },
    { label: 'Support', email: 'support@dialpulse.internal', role: 'platform_support' },
    { label: 'Security', email: 'security@dialpulse.internal', role: 'platform_security' },
  ];

  const selectedStaff = staffIdentities.find((item) => item.email === email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    setCookieBlockedError(false);
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
      setCookieBlockedError(err?.code === 'COOKIE_BLOCKED_IN_FRAME');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;

    setLoading(true);
    setLocalError(null);
    setCookieBlockedError(false);
    try {
      if (isRecoveryMode) {
        await verifyMfaRecovery(mfaChallenge.token, recoveryCode.trim());
      } else {
        await verifyMfaChallenge(mfaChallenge.token, mfaCode.trim());
      }
    } catch (err: any) {
      setLocalError(err.message || 'MFA verification failed');
      setCookieBlockedError(err?.code === 'COOKIE_BLOCKED_IN_FRAME');
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
    setLocalError(null);
  };

  return (
    <div className="min-h-dvh w-full bg-[#F8FAF9] flex flex-col items-center justify-center px-4 py-2.5 sm:px-6 sm:py-3 overflow-x-hidden selection:bg-teal-100 selection:text-[#00695C]">
      <div className="w-full max-w-[420px] my-auto space-y-2.5">
        {/* Brand Header with DialPulse Logo */}
        <div className="flex flex-col items-center text-center space-y-1">
          <Logo size="md" variant="light" showSubtitle={false} />
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <span>Internal Platform Control Center</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#00695C] font-bold">Tier-1 Access</span>
          </div>
        </div>

        {/* Security Boundary Warning Card */}
        <div className="px-3 py-2 bg-red-50/90 border border-red-200/90 rounded-[14px] text-slate-900 text-xs flex items-start gap-2.5 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
          <div className="min-w-0 leading-snug">
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#BA1A1A] font-mono block">
              Restricted Platform Boundary
            </span>
            <p className="text-slate-600 text-[11px]">
              Authorized DialPulse platform staff only. Tenant accounts have zero access.
            </p>
          </div>
        </div>

        {/* Dynamic Card: Password Login vs MFA Challenge */}
        <Card variant="elevated" rounded="3xl" className="p-4 sm:p-5 space-y-3">
          {localError && (
            <div
              role="alert"
              className="p-2.5 bg-red-50 border border-red-200 text-[#BA1A1A] text-xs rounded-[12px] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-snug font-medium">{localError}</p>
                {cookieBlockedError && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '/login'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-1.5 text-[11px] font-bold text-[#00695C] hover:underline"
                  >
                    Open in Dedicated Browser Tab →
                  </a>
                )}
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <p className="text-[11px] text-[#BA1A1A] mt-1 font-semibold tabular-nums">
                    Remaining attempts before temporary lockout: {remainingAttempts}
                  </p>
                )}
              </div>
            </div>
          )}

          {!mfaChallenge ? (
            /* Standard Password Authentication */
            <>
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <Input
                  label="Platform Staff Email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@dialpulse.internal"
                />

                <Input
                  label="Staff Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <div className="pt-0.5">
                  <Button
                    type="submit"
                    variant="filled"
                    size="md"
                    loading={loading}
                    className="w-full min-h-[42px] sm:min-h-[40px]"
                  >
                    <span>{loading ? 'Verifying Platform Staff...' : 'Access Control Center'}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </Button>
                </div>
              </form>

              {/* Compact Inline Staff Identity Selector */}
              <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                    Quick Fill Staff Role
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEmailDirectory((prev) => !prev)}
                    className="text-[11px] font-mono text-[#00695C] hover:underline font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C] rounded"
                  >
                    {showEmailDirectory ? 'Hide emails' : 'View emails'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {staffIdentities.map((item) => {
                    const isSelected = email === item.email;
                    return (
                      <button
                        key={item.email}
                        type="button"
                        onClick={() => handleSelectEmail(item.email)}
                        title={item.email}
                        className={`min-h-[40px] sm:min-h-[34px] px-2.5 py-1 rounded-[10px] border text-xs font-semibold transition-all duration-150 flex items-center justify-center whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C] ${
                          isSelected
                            ? 'bg-teal-50 border-[#00695C] text-[#004D40] shadow-2xs'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {selectedStaff && !showEmailDirectory && (
                  <p className="text-[11px] font-mono text-slate-500 truncate text-center">
                    {selectedStaff.email} · {selectedStaff.role}
                  </p>
                )}

                {showEmailDirectory && (
                  <div className="pt-1 space-y-1 text-[11px] font-mono text-slate-600">
                    {staffIdentities.map((item) => (
                      <button
                        key={item.email}
                        type="button"
                        onClick={() => handleSelectEmail(item.email)}
                        className={`w-full px-2.5 py-1.5 rounded-[8px] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                          email === item.email
                            ? 'bg-teal-50/80 text-[#004D40] font-semibold'
                            : 'hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <span className="truncate">{item.email}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{item.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* MFA Step-Up Verification */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-[12px] bg-teal-50 border border-teal-200 flex items-center justify-center text-[#00695C] shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-display font-bold text-slate-900">Two-Factor Authentication</h2>
                    <p className="text-[11px] text-slate-500 font-mono truncate">{mfaChallenge.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-medium cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <form onSubmit={handleMfaSubmit} className="space-y-4">
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
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full text-center tracking-[0.35em] sm:tracking-[0.5em] text-xl sm:text-2xl font-mono py-2.5 px-4 rounded-[12px] border border-slate-200 focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 bg-slate-50 focus:bg-white text-slate-900 transition-all tabular-nums"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                      Enter the current time-based code from your authenticator app
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
                      className="w-full text-center font-mono tracking-widest text-base sm:text-lg py-2.5 px-4 rounded-[12px] border border-slate-200 focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 bg-slate-50 focus:bg-white text-slate-900 transition-all"
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
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </Button>
              </form>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(!isRecoveryMode);
                    setLocalError(null);
                  }}
                  className="text-[#00695C] hover:underline font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isRecoveryMode ? 'Use Authenticator Code' : 'Lost authenticator? Use recovery code'}</span>
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Security Compliance Footer */}
        <div className="text-center text-[11px] text-slate-500 font-mono flex flex-wrap items-center justify-center gap-2">
          <span>DialPulse Central CRM · Tier-1 Staff Access</span>
          <span aria-hidden="true">·</span>
          <Link
            to={PLATFORM_ROUTES.PRIVACY_POLICY}
            className="text-[#00695C] hover:underline font-semibold"
          >
            Privacy Policy & Grievance Officer
          </Link>
        </div>
      </div>
    </div>
  );
};
