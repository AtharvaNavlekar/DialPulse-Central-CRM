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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCurrentSession() {
      try {
        const u = await api.getCurrentUser();
        setUser(u);
      } catch (err: any) {
        // Attempt token refresh via HTTP-only cookie if initial check fails
        try {
          const refreshed = await api.refreshToken();
          if (refreshed) {
            const u = await api.getCurrentUser();
            setUser(u);
            return;
          }
        } catch {
          // Session unauthenticated or refresh expired
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadCurrentSession();
  }, []);

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      if ('user' in res) {
        setUser(res.user);
      }
      return res;
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyMfaChallenge = async (challengeToken: string, code: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.submitMfaChallenge(challengeToken, code);
      setUser(res.user);
    } catch (err: any) {
      setError(err.message || 'MFA verification failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyMfaRecovery = async (challengeToken: string, recoveryCode: string): Promise<number> => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.submitMfaRecovery(challengeToken, recoveryCode);
      setUser(res.user);
      return res.remainingRecoveryCodes;
    } catch (err: any) {
      setError(err.message || 'Recovery code verification failed');
      throw err;
    } finally {
      setLoading(false);
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
    if (!user) return false;
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
