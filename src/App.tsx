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
      <div className="min-h-screen bg-[#E5C8B2] flex flex-col items-center justify-center p-4 text-[#282820]">
        <div className="w-11 h-11 rounded-[14px] bg-[#175E17] text-white border border-[#228B22] flex items-center justify-center font-display font-extrabold text-lg mb-3 shadow-[0_4px_18px_rgba(40,40,32,0.12)]">
          DP
        </div>
        <RefreshCw className="w-5 h-5 text-[#175E17] animate-spin mb-2" />
        <p className="text-xs font-mono font-medium text-[#5C554D]">
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
        <div className="min-h-screen bg-[#E5C8B2] flex flex-col items-center justify-center p-6 text-[#282820] font-sans">
          <div className="w-full max-w-md bg-[#FAF3ED] border border-[#CBB5A4] rounded-[20px] p-6 shadow-[0_10px_28px_rgba(40,40,32,0.12)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-[#FDECEC] border border-[#EAB5B5] text-[#A61B1B] flex items-center justify-center font-bold">
                !
              </div>
              <div>
                <h2 className="text-base font-display font-bold text-[#282820]">Application Error</h2>
                <p className="text-xs text-[#5C554D] font-mono">DialPulse Central CRM Control Center</p>
              </div>
            </div>
            <div className="p-3 bg-[#FDECEC] text-[#7E1414] text-xs rounded-[12px] font-mono break-words border border-[#EAB5B5]">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 bg-[#175E17] text-white text-xs font-semibold rounded-[12px] hover:bg-[#114711] transition-colors cursor-pointer"
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
