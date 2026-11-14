import React, { useState } from 'react';
import { ArrowRight, AlertCircle, ShieldAlert, KeyRound, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
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
    setLocalError(null);
  };

  return (
    <div className="min-h-screen bg-[#E5C8B2] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-[#228B22]/20 selection:text-[#175E17]">
      <div className="w-full max-w-md space-y-5">
        {/* Brand Header with DialPulse Logo */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Logo size="lg" variant="light" showSubtitle={true} />
          <div className="flex items-center gap-1.5 text-xs text-[#5C554D] font-mono pt-1">
            <span>Privileged Internal Environment</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#175E17] font-bold">Tier-1 Access</span>
          </div>
        </div>

        {/* Security Boundary Warning Card */}
        <div className="p-3.5 bg-[#F5E9DF] border border-[#CBB5A4] rounded-[16px] text-[#282820] text-xs flex items-start gap-3 shadow-[0_4px_14px_rgba(40,40,32,0.06)]">
          <ShieldAlert className="w-4 h-4 text-[#A61B1B] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#A61B1B] font-mono">
              Restricted Platform Boundary
            </span>
            <p className="mt-0.5 text-[#5C554D] text-[11px] leading-relaxed">
              Exclusively for authorized DialPulse platform staff. Customer tenant accounts (owners, TLs, telecallers) have zero access here.
            </p>
          </div>
        </div>

        {/* Dynamic Card: Password Login vs MFA Challenge */}
        <Card variant="elevated" rounded="3xl" className="p-6 sm:p-7 space-y-5">
          {localError && (
            <div
              role="alert"
              className="p-3 bg-[#FDECEC] border border-[#EAB5B5] text-[#7E1414] text-xs rounded-[12px] flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-[#A61B1B] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs leading-relaxed font-medium">{localError}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <p className="text-[11px] text-[#A61B1B] mt-1 font-semibold tabular-nums">
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
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@dialpulse.internal"
                  helperText="Requires an active, authorized platform staff identity"
                />

                <Input
                  label="Staff Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  helperText="Verified against a server-side password hash"
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="p-0.5 text-[#5C554D] hover:text-[#282820] rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  loading={loading}
                  className="w-full"
                >
                  <span>{loading ? 'Verifying Platform Staff...' : 'Access Control Center'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </form>

              {/* Development Staff Quick Select Options */}
              <div className="pt-4 border-t border-[#DFCBB9] space-y-2.5">
                <div className="text-[10px] font-mono uppercase font-bold text-[#5C554D] tracking-wider">
                  Platform Staff Identities
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { email: 'admin@dialpulse.internal', role: 'platform_admin' },
                    { email: 'support@dialpulse.internal', role: 'platform_support' },
                    { email: 'security@dialpulse.internal', role: 'platform_security' },
                  ].map((item) => {
                    const isSelected = email === item.email;
                    return (
                      <button
                        key={item.email}
                        type="button"
                        onClick={() => handleSelectEmail(item.email)}
                        className={`w-full py-2.5 px-3 rounded-[12px] border text-left flex items-center justify-between text-xs transition-all duration-150 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22] ${
                          isSelected
                            ? 'bg-[#E6F2E6] border-[#228B22] text-[#114711]'
                            : 'bg-[#F5E9DF] hover:bg-[#ECD9C8] border-[#DFCBB9] text-[#282820]'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-[#282820]">{item.email}</span>
                          <span className="text-[10px] font-mono text-[#5C554D] ml-1.5">· {item.role}</span>
                        </div>
                        <span className="text-[11px] font-mono text-[#175E17] font-bold group-hover:underline shrink-0">
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* MFA Step-Up Verification */
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#DFCBB9]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-[12px] bg-[#E6F2E6] border border-[#228B22]/30 flex items-center justify-center text-[#175E17] shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-display font-bold text-[#282820]">Two-Factor Authentication</h2>
                    <p className="text-[11px] text-[#5C554D] font-mono truncate">{mfaChallenge.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-[#5C554D] hover:text-[#282820] flex items-center gap-1 font-medium cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <form onSubmit={handleMfaSubmit} className="space-y-4">
                {!isRecoveryMode ? (
                  <div>
                    <label className="block text-xs font-semibold text-[#282820] mb-1.5">
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
                      className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 px-4 rounded-[12px] border border-[#CBB5A4] focus:outline-none focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20 bg-[#F5E9DF] focus:bg-[#FAF3ED] text-[#282820] transition-all tabular-nums"
                    />
                    <p className="text-[11px] text-[#5C554D] mt-1.5 text-center">
                      Enter the current time-based code from your authenticator app
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-[#282820] mb-1.5">
                      Single-Use Recovery Code
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 9))}
                      placeholder="XXXX-XXXX"
                      className="w-full text-center font-mono tracking-widest text-lg py-3 px-4 rounded-[12px] border border-[#CBB5A4] focus:outline-none focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20 bg-[#F5E9DF] focus:bg-[#FAF3ED] text-[#282820] transition-all"
                    />
                    <p className="text-[11px] text-[#5C554D] mt-1.5 text-center">
                      Enter one of your 8-character recovery backup codes
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  loading={loading}
                  className="w-full"
                  disabled={!isRecoveryMode ? mfaCode.length !== 6 : recoveryCode.length < 8}
                >
                  <span>{loading ? 'Verifying Factor...' : 'Verify & Enter Control Center'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </form>

              <div className="pt-3 border-t border-[#DFCBB9] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecoveryMode(!isRecoveryMode);
                    setLocalError(null);
                  }}
                  className="text-[#175E17] hover:underline font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isRecoveryMode ? 'Use Authenticator Code' : 'Lost authenticator? Use recovery code'}</span>
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Security Compliance Footer */}
        <div className="text-center text-[11px] text-[#5C554D] font-mono">
          DialPulse Central CRM · Privileged Staff Access · Phase 01C Protected
        </div>
      </div>
    </div>
  );
};
