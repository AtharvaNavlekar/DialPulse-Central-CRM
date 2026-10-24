import React, { useState, useEffect } from 'react';
import { Sidebar, NavItemKey } from './Sidebar.tsx';
import { TopBar } from './TopBar.tsx';
import { OverviewView } from '../../features/overview/OverviewView.tsx';
import { TenantListView } from '../../features/tenants/TenantListView.tsx';
import { AuditListView } from '../../features/audit/AuditListView.tsx';
import { SecurityView } from '../../features/security/SecurityView.tsx';
import { RbacMatrixView } from '../../features/rbac/RbacMatrixView.tsx';
import { ModulePlaceholder } from '../../features/unimplemented/ModulePlaceholder.tsx';
import { ImpersonationModal } from '../../features/impersonation/ImpersonationView.tsx';
import { DbInfoModal } from '../common/DbInfoModal.tsx';
import { api } from '../../app/api.ts';
import { HealthCheckData } from '../../app/types.ts';

export const AppShell: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavItemKey>('overview');
  const [impersonationOpen, setImpersonationOpen] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);
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

  const renderCurrentView = () => {
    switch (currentTab) {
      case 'overview':
        return (
          <OverviewView
            onNavigateToTenants={() => setCurrentTab('tenants')}
            onNavigateToAudit={() => setCurrentTab('audit')}
            onNavigateToSecurity={() => setCurrentTab('security')}
            onOpenDbModal={() => setDbModalOpen(true)}
          />
        );
      case 'tenants':
        return <TenantListView />;
      case 'security':
        return <SecurityView />;
      case 'audit':
        return <AuditListView />;
      case 'staff':
        return <RbacMatrixView />;
      case 'billing':
      case 'support':
      case 'features':
      case 'infrastructure':
      case 'analytics':
        return (
          <ModulePlaceholder
            moduleKey={currentTab}
            onBackToOverview={() => setCurrentTab('overview')}
          />
        );
      default:
        return (
          <OverviewView
            onNavigateToTenants={() => setCurrentTab('tenants')}
            onNavigateToAudit={() => setCurrentTab('audit')}
            onNavigateToSecurity={() => setCurrentTab('security')}
            onOpenDbModal={() => setDbModalOpen(true)}
          />
        );
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenImpersonation={() => setImpersonationOpen(true)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          currentTabName={currentTab}
          isDbConnected={healthData?.database?.reachable ?? false}
          dbLatencyMs={healthData?.database?.latencyMs}
          onOpenDbDetails={() => setDbModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto bg-[#F8FAF9]">
          {renderCurrentView()}
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
    </div>
  );
};
