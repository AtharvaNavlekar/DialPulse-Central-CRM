import React, { createContext, useContext, useState, useEffect } from 'react';
import { PlatformUser, PlatformRole, LoginResponse } from './types.ts';
import { api } from './api.ts';

interface AuthContextType {
  user: PlatformUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verifyMfaChallenge: (challengeToken: string, code: string) => Promise<void>;
  verifyMfaRecovery: (challengeToken: string, recoveryCode: string) => Promise<number>;
  logout: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{
  children: React.ReactNode;
  initialUser?: PlatformUser | null;
}> = ({ children, initialUser }) => {
  const hasExplicitInitial = initialUser !== undefined;
  const [user, setUser] = useState<PlatformUser | null>(hasExplicitInitial ? initialUser : null);
  const [loading, setLoading] = useState(!hasExplicitInitial);
  const [error, setError] = useState<string | null>(null);
  const authGenerationRef = React.useRef(0);

  useEffect(() => {
    if (hasExplicitInitial) return;
    api.setUnauthorizedHandler(() => {
      authGenerationRef.current += 1;
      setUser(null);
    });
    return () => {
      api.setUnauthorizedHandler(null);
    };
  }, [hasExplicitInitial]);

  useEffect(() => {
    if (hasExplicitInitial) return;
    const bootGeneration = authGenerationRef.current;
    async function loadCurrentSession() {
      try {
        const u = await api.getCurrentUser({ suppressUnauthorizedCallback: true });
        if (authGenerationRef.current === bootGeneration) {
          setUser(u);
        }
      } catch {
        if (authGenerationRef.current === bootGeneration) {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    }
    loadCurrentSession();
  }, [hasExplicitInitial]);

  const verifyCookieRoundTrip = async (): Promise<PlatformUser> => {
    try {
      return await api.getCurrentUser({ suppressUnauthorizedCallback: true });
    } catch (err: any) {
      if (err?.status === 401) {
        const cookieErr = new Error(
          'Your browser blocked authentication cookies in this embedded preview frame. Allow site cookies or open DialPulse in a dedicated browser tab.'
        ) as any;
        cookieErr.code = 'COOKIE_BLOCKED_IN_FRAME';
        cookieErr.status = 401;
        throw cookieErr;
      }
      throw err;
    }
  };

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    setError(null);
    try {
      const res = await api.login(email, password);
      if ('user' in res) {
        const verifiedUser = await verifyCookieRoundTrip();
        authGenerationRef.current += 1;
        setUser(verifiedUser);
      }
      return res;
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    }
  };

  const verifyMfaChallenge = async (challengeToken: string, code: string) => {
    setError(null);
    try {
      await api.submitMfaChallenge(challengeToken, code);
      const verifiedUser = await verifyCookieRoundTrip();
      authGenerationRef.current += 1;
      setUser(verifiedUser);
    } catch (err: any) {
      setError(err.message || 'MFA verification failed');
      throw err;
    }
  };

  const verifyMfaRecovery = async (challengeToken: string, recoveryCode: string): Promise<number> => {
    setError(null);
    try {
      const res = await api.submitMfaRecovery(challengeToken, recoveryCode);
      const verifiedUser = await verifyCookieRoundTrip();
      authGenerationRef.current += 1;
      setUser(verifiedUser);
      return res.remainingRecoveryCodes;
    } catch (err: any) {
      setError(err.message || 'Recovery code verification failed');
      throw err;
    }
  };

  const refreshUser = async () => {
    try {
      const u = await api.getCurrentUser();
      setUser(u);
    } catch {
      // ignore
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    setUser(null);
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (!user || !Array.isArray(user.permissions)) return false;
    return user.permissions.includes(permissionCode);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        verifyMfaChallenge,
        verifyMfaRecovery,
        logout,
        hasPermission,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
