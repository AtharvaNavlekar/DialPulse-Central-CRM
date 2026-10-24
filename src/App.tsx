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
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 rounded-xl bg-teal-800 text-white flex items-center justify-center font-bold text-lg mb-3 shadow-md">
          DP
        </div>
        <RefreshCw className="w-6 h-6 text-teal-700 animate-spin mb-2" />
        <p className="text-xs font-mono font-medium text-slate-600">
          DialPulse Central CRM: Initializing Security Context...
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
          <div className="w-full max-w-md bg-white border border-red-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                !
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Application Error</h2>
                <p className="text-xs text-slate-500 font-mono">DialPulse Central CRM Control Center</p>
              </div>
            </div>
            <div className="p-3 bg-red-50 text-red-900 text-xs rounded-xl font-mono break-words border border-red-100">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 bg-[#00695C] text-white text-xs font-semibold rounded-xl hover:bg-[#004D40] transition-colors"
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
