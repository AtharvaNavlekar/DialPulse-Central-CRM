import React, { createContext, useContext, useState, useEffect } from 'react';
import { PlatformUser, PlatformRole } from './types.ts';
import { api } from './api.ts';

interface AuthContextType {
  user: PlatformUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchRoleQuick: (role: PlatformRole) => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCurrentSession() {
      try {
        const token = api.getToken();
        if (token) {
          const u = await api.getCurrentUser();
          setUser(u);
        } else {
          // Auto-login with default platform admin for review convenience if desired
          // or leave at login screen. Let's try to restore or fall back cleanly.
        }
      } catch (err: any) {
        console.warn('Initial session check failed:', err.message);
        api.setToken(null);
      } finally {
        setLoading(false);
      }
    }
    loadCurrentSession();
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setUser(res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
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

  const switchRoleQuick = async (role: PlatformRole) => {
    // Strictly disable quick role evaluation in production environments
    if (!import.meta.env.DEV) {
      throw new Error('Quick role evaluation is strictly disabled in production builds.');
    }
    const roleEmailMap: Record<PlatformRole, string> = {
      platform_admin: 'admin@dialpulse.internal',
      platform_support: 'support@dialpulse.internal',
      platform_security: 'security@dialpulse.internal',
    };
    await login(roleEmailMap[role], 'CentralPlatform2026!');
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
        logout,
        switchRoleQuick,
        hasPermission,
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
