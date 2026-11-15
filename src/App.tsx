/**
 * DIALPULSE CENTRAL CRM
 * Internal Platform Control Center
 */

import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from 'react-router-dom';
import { RefreshCw, ShieldAlert, ArrowLeft } from 'lucide-react';
import { AuthProvider, useAuth } from './app/AuthContext.tsx';
import { PLATFORM_ROUTES, sanitizeReturnPath } from './app/routes.ts';
import { PLATFORM_PERMISSIONS, PlatformPermission } from './server/policies/permissions.ts';
import { LoginPage } from './pages/LoginPage.tsx';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { AppShell, AppShellOutletContext } from './components/layout/AppShell.tsx';
import { OverviewView } from './features/overview/OverviewView.tsx';
import { TenantListView } from './features/tenants/TenantListView.tsx';
import { SecurityView } from './features/security/SecurityView.tsx';
import { AuditListView } from './features/audit/AuditListView.tsx';
import { RbacMatrixView } from './features/rbac/RbacMatrixView.tsx';
import { BillingView } from './features/billing/BillingView.tsx';
import { SupportView } from './features/support/SupportView.tsx';
import { FeatureFlagsView } from './features/features/FeatureFlagsView.tsx';
import { InfrastructureView } from './features/infrastructure/InfrastructureView.tsx';
import { AnalyticsView } from './features/analytics/AnalyticsView.tsx';
import { Card } from './components/ui/Card.tsx';
import { Button } from './components/ui/Button.tsx';

function InitializingGate() {
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

export function RequirePlatformAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <InitializingGate />;
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={PLATFORM_ROUTES.LOGIN} replace state={{ from }} />;
  }

  return <Outlet />;
}

export function LoginRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <InitializingGate />;
  }

  if (user) {
    const state = location.state as { from?: string } | null;
    const returnTo = sanitizeReturnPath(state?.from);
    return <Navigate to={returnTo} replace />;
  }

  return <LoginPage />;
}

interface PermissionGuardProps {
  permission: PlatformPermission;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ permission, children }) => {
  const { hasPermission, user } = useAuth();
  const navigate = useNavigate();

  if (!hasPermission(permission)) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <Card variant="elevated" rounded="3xl" className="p-6 sm:p-10 text-center space-y-5">
          <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-[16px] flex items-center justify-center mx-auto text-[#BA1A1A]">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-[8px] bg-red-50 border border-red-200 text-[10px] font-mono font-bold text-[#BA1A1A] tracking-wider uppercase">
              <span>HTTP 403</span>
              <span>·</span>
              <span>Permission Restricted</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900">
              Access Restricted by Role Policy
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Your active platform role (<span className="font-mono font-semibold text-slate-900">{user?.platformRole}</span>) does not include <span className="font-mono font-semibold text-slate-900">{permission}</span>.
            </p>
          </div>
          <div className="flex justify-center pt-1">
            <Button
              variant="filled"
              size="md"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate(PLATFORM_ROUTES.OVERVIEW)}
            >
              Return to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

const OverviewRoute: React.FC = () => {
  const navigate = useNavigate();
  const outletContext = useOutletContext<AppShellOutletContext | null>();

  return (
    <OverviewView
      onNavigateToTenants={() => navigate(PLATFORM_ROUTES.TENANTS)}
      onNavigateToAudit={() => navigate(PLATFORM_ROUTES.AUDIT)}
      onNavigateToSecurity={() => navigate(PLATFORM_ROUTES.SECURITY)}
      onOpenDbModal={() => outletContext?.openDbModal()}
    />
  );
};

export function AppRoutes() {
  return (
    <Routes>
      <Route path={PLATFORM_ROUTES.LOGIN} element={<LoginRoute />} />
      <Route path={PLATFORM_ROUTES.PRIVACY_POLICY} element={<PrivacyPolicyPage />} />

      <Route element={<RequirePlatformAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={PLATFORM_ROUTES.OVERVIEW} replace />} />

          <Route
            path={PLATFORM_ROUTES.OVERVIEW}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.OVERVIEW_READ}>
                <OverviewRoute />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.TENANTS}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.TENANTS_READ}>
                <TenantListView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.SECURITY}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.SECURITY_READ}>
                <SecurityView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.AUDIT}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.AUDIT_READ}>
                <AuditListView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.STAFF}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.STAFF_READ}>
                <RbacMatrixView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.BILLING}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.BILLING_READ}>
                <BillingView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.SUPPORT}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.SUPPORT_READ}>
                <SupportView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.CONFIGURATION}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.FEATURES_READ}>
                <FeatureFlagsView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.INFRASTRUCTURE}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.INFRASTRUCTURE_READ}>
                <InfrastructureView />
              </PermissionGuard>
            }
          />

          <Route
            path={PLATFORM_ROUTES.ANALYTICS}
            element={
              <PermissionGuard permission={PLATFORM_PERMISSIONS.ANALYTICS_READ}>
                <AnalyticsView />
              </PermissionGuard>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
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
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
