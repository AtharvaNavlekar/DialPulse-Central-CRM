import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PlatformUser } from './types.ts';
import { api } from './api.ts';

type LoginAttempt = {
  success: boolean;
  user?: PlatformUser;
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  secret?: string;
  provisioningUri?: string;
};

interface AuthContextType {
  user: PlatformUser | null;
  loading: boolean;
  error: string | null;
  recoveryCodes: string[] | null;
  login: (email: string, password: string) => Promise<LoginAttempt>;
  completeMfa: (code: string, enroll: boolean) => Promise<void>;
  acknowledgeRecoveryCodes: () => void;
  logout: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pendingMfaUser, setPendingMfaUser] = useState<PlatformUser | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpCode, setStepUpCode] = useState('');
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const pendingPromise = useRef<Promise<boolean> | null>(null);

  const finishStepUp = (accepted: boolean) => {
    const resolve = resolver.current;
    resolver.current = null; pendingPromise.current = null;
    setStepUpOpen(false); setStepUpCode(''); setStepUpError(null);
    if (resolve) resolve(accepted);
  };

  useEffect(() => {
    api.setStepUpHandler(() => {
      if (pendingPromise.current) return pendingPromise.current;
      pendingPromise.current = new Promise<boolean>((resolve) => {
        resolver.current = resolve; setStepUpCode(''); setStepUpError(null); setStepUpOpen(true);
      });
      return pendingPromise.current;
    });
    return () => {
      api.setStepUpHandler(null);
      if (resolver.current) resolver.current(false);
      resolver.current = null; pendingPromise.current = null;
    };
  }, []);

  useEffect(() => {
    async function loadSession() {
      try { setUser(await api.getCurrentUser()); }
      catch {
        try { if (await api.refreshToken()) { setUser(await api.getCurrentUser()); return; } }
        catch { /* invalid, expired, legacy or unverified session */ }
        setUser(null);
      } finally { setLoading(false); }
    }
    loadSession();
  }, []);

  const login = async (email: string, password: string): Promise<LoginAttempt> => {
    setError(null); setLoading(true);
    try {
      const result = await api.login(email, password);
      if (result.user) setUser(result.user);
      return result;
    } catch (err: any) { setError(err.message || 'Login failed'); throw err; }
    finally { setLoading(false); }
  };

  const completeMfa = async (code: string, enroll: boolean) => {
    setError(null); setLoading(true);
    try {
      if (enroll) {
        const result = await api.enrollMfa(code);
        setPendingMfaUser(result.user);
        setRecoveryCodes(result.recoveryCodes);
      } else {
        const result = await api.verifyMfa(code);
        setUser(result.user);
      }
    } catch (err: any) { setError(err.message || 'MFA verification failed'); throw err; }
    finally { setLoading(false); }
  };

  const acknowledgeRecoveryCodes = () => {
    if (pendingMfaUser) setUser(pendingMfaUser);
    setPendingMfaUser(null); setRecoveryCodes(null);
  };

  const logout = async () => {
    try { await api.logout(); } catch { /* server remains authoritative */ }
    setUser(null); setPendingMfaUser(null); setRecoveryCodes(null);
  };

  const handleStepUp = async (event: React.FormEvent) => {
    event.preventDefault(); setStepUpBusy(true); setStepUpError(null);
    try { await api.verifyStepUpMfa(stepUpCode); finishStepUp(true); }
    catch (err: any) { setStepUpError(err.message || 'Authenticator verification failed'); }
    finally { setStepUpBusy(false); }
  };

  const hasPermission = (code: string) => Boolean(user && user.permissions.includes(code));

  return (
    <AuthContext.Provider value={{ user, loading, error, recoveryCodes, login, completeMfa, acknowledgeRecoveryCodes, logout, hasPermission }}>
      {children}
      {stepUpOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="step-up-title">
            <h2 id="step-up-title" className="text-lg font-semibold text-slate-900">Verify it's you</h2>
            <p className="mt-1 mb-4 text-sm text-slate-600">A sensitive action needs a fresh authenticator code.</p>
            {stepUpError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{stepUpError}</p>}
            <form onSubmit={handleStepUp} className="space-y-4">
              <label htmlFor="step-up-code" className="block text-sm font-medium text-slate-700">6-digit code</label>
              <input id="step-up-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={stepUpCode} onChange={(e) => setStepUpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
              <div className="flex gap-3">
                <button type="button" onClick={() => finishStepUp(false)} className="flex-1 rounded-xl border px-4 py-2 text-sm">Cancel</button>
                <button type="submit" disabled={stepUpBusy} className="flex-1 rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{stepUpBusy ? 'Verifying…' : 'Verify & continue'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
