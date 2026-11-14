import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { TopBar } from './TopBar.tsx';
import { ImpersonationModal } from '../../features/impersonation/ImpersonationView.tsx';
import { DbInfoModal } from '../common/DbInfoModal.tsx';
import { MfaEnrollmentModal } from '../auth/MfaEnrollmentModal.tsx';
import { api } from '../../app/api.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { HealthCheckData } from '../../app/types.ts';

export interface AppShellOutletContext {
  openDbModal: () => void;
}

export const AppShell: React.FC = () => {
  const { refreshUser } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [impersonationOpen, setImpersonationOpen] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [mfaEnrollOpen, setMfaEnrollOpen] = useState(false);
  const [healthData, setHealthData] = useState<HealthCheckData | null>(null);

  const refreshHealth = async () => {
    try {
      const data = await api.getHealth();
      setHealthData(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="flex h-dvh bg-[#F8FAF9] overflow-hidden text-slate-900">
      {/* Sidebar Navigation */}
      <Sidebar
        onOpenImpersonation={() => setImpersonationOpen(true)}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          isDbConnected={healthData?.database?.reachable ?? false}
          dbLatencyMs={healthData?.database?.latencyMs}
          onOpenDbDetails={() => setDbModalOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenMfaSetup={() => setMfaEnrollOpen(true)}
        />

        <main className="flex-1 overflow-y-auto bg-[#F8FAF9]">
          <Outlet context={{ openDbModal: () => setDbModalOpen(true) } satisfies AppShellOutletContext} />
        </main>
      </div>

      {/* Impersonation Gateway Modal */}
      <ImpersonationModal
        isOpen={impersonationOpen}
        onClose={() => setImpersonationOpen(false)}
      />

      {/* Database Specification & Connection Info Modal */}
      <DbInfoModal
        isOpen={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
      />

      {/* MFA Enrollment Modal */}
      <MfaEnrollmentModal
        isOpen={mfaEnrollOpen}
        onClose={() => setMfaEnrollOpen(false)}
        onEnrolled={() => refreshUser()}
      />
    </div>
  );
};
