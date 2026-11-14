/**
 * DIALPULSE CENTRAL CRM
 * Internal Platform Control Center
 */

import React from 'react';
import { AuthProvider, useAuth } from './app/AuthContext.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { RefreshCw } from 'lucide-react';

function CentralCrmRoot() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAF9] flex flex-col items-center justify-center p-4 text-slate-900">
        <div className="w-11 h-11 rounded-[14px] bg-[#00695C] text-white border border-teal-800 flex items-center justify-center font-display font-extrabold text-lg mb-3 shadow-sm">
          DP
        </div>
        <RefreshCw className="w-5 h-5 text-[#00695C] animate-spin mb-2" />
        <p className="text-xs font-mono font-medium text-slate-600">
          DialPulse Central CRM · Initializing Security Context...
        </p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppShell />;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI exception in Central CRM:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAF9] flex flex-col items-center justify-center p-6 text-slate-900 font-sans">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-[20px] p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-red-50 border border-red-200 text-[#BA1A1A] flex items-center justify-center font-bold">
                !
              </div>
              <div>
                <h2 className="text-base font-display font-bold text-slate-900">Application Error</h2>
                <p className="text-xs text-slate-500 font-mono">DialPulse Central CRM Control Center</p>
              </div>
            </div>
            <div className="p-3 bg-red-50 text-[#BA1A1A] text-xs rounded-[12px] font-mono break-words border border-red-200">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 bg-[#00695C] text-white text-xs font-semibold rounded-[12px] hover:bg-[#004D40] transition-colors cursor-pointer"
            >
              Reload Platform Interface
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CentralCrmRoot />
      </AuthProvider>
    </ErrorBoundary>
  );
}
