import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  LifeBuoy,
  ShieldCheck,
  Sliders,
  Server,
  FileText,
  UsersRound,
  BarChart3,
  UserCheck2,
  Lock,
  X,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { Logo } from '../common/Logo.tsx';

export type NavItemKey =
  | 'overview'
  | 'tenants'
  | 'billing'
  | 'support'
  | 'security'
  | 'features'
  | 'infrastructure'
  | 'audit'
  | 'staff'
  | 'analytics';

interface SidebarProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  onOpenImpersonation: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenImpersonation,
  isOpen = false,
  onClose,
}) => {
  const { user, hasPermission } = useAuth();

  const navItems = [
    {
      key: 'overview' as NavItemKey,
      label: 'Dashboard',
      icon: LayoutDashboard,
      permission: PLATFORM_PERMISSIONS.OVERVIEW_READ,
      badge: 'REAL',
    },
    {
      key: 'tenants' as NavItemKey,
      label: 'Tenants',
      icon: Building2,
      permission: PLATFORM_PERMISSIONS.TENANTS_READ,
      badge: 'REAL',
    },
    {
      key: 'security' as NavItemKey,
      label: 'Security / SOC',
      icon: ShieldCheck,
      permission: PLATFORM_PERMISSIONS.SECURITY_READ,
      badge: 'REAL',
    },
    {
      key: 'audit' as NavItemKey,
      label: 'Global Audit',
      icon: FileText,
      permission: PLATFORM_PERMISSIONS.AUDIT_READ,
      badge: 'REAL',
    },
    {
      key: 'staff' as NavItemKey,
      label: 'Platform Staff & RBAC',
      icon: UsersRound,
      permission: PLATFORM_PERMISSIONS.STAFF_READ,
      badge: 'REAL',
    },
    {
      key: 'billing' as NavItemKey,
      label: 'Billing & Plans',
      icon: Receipt,
      permission: PLATFORM_PERMISSIONS.BILLING_READ,
      badge: 'PLANNED',
      unimplemented: true,
    },
    {
      key: 'support' as NavItemKey,
      label: 'Platform Support',
      icon: LifeBuoy,
      permission: PLATFORM_PERMISSIONS.SUPPORT_READ,
      badge: 'PLANNED',
      unimplemented: true,
    },
    {
      key: 'features' as NavItemKey,
      label: 'Feature Toggles',
      icon: Sliders,
      permission: PLATFORM_PERMISSIONS.FEATURES_READ,
      badge: 'PLANNED',
      unimplemented: true,
    },
    {
      key: 'infrastructure' as NavItemKey,
      label: 'Infrastructure & Ops',
      icon: Server,
      permission: PLATFORM_PERMISSIONS.INFRASTRUCTURE_READ,
      badge: 'PLANNED',
      unimplemented: true,
    },
    {
      key: 'analytics' as NavItemKey,
      label: 'Platform Analytics',
      icon: BarChart3,
      permission: PLATFORM_PERMISSIONS.ANALYTICS_READ,
      badge: 'PLANNED',
      unimplemented: true,
    },
  ];

  const canImpersonate = hasPermission(PLATFORM_PERMISSIONS.IMPERSONATION_START);

  const handleNavClick = (key: NavItemKey) => {
    onSelectTab(key);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[1px] lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-68 bg-slate-900 text-slate-100 flex flex-col h-screen border-r border-slate-800 select-none shrink-0 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
          <Logo variant="dark" size="sm" showSubtitle={true} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-[10px] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Platform navigation">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            Core Operations
          </div>

          {navItems.map((item) => {
            const hasAccess = hasPermission(item.permission);
            const isActive = currentTab === item.key;
            const Icon = item.icon;

            if (!hasAccess) {
              return null;
            }

            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                className={`relative w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-[12px] transition-all duration-150 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                  isActive
                    ? 'bg-[#00695C] text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white font-medium'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-teal-300"
                    aria-hidden="true"
                  />
                )}

                <div className={`flex items-center gap-2.5 truncate ${isActive ? 'pl-1.5' : ''}`}>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-teal-300'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded-[6px] font-bold uppercase tracking-wider shrink-0 ${
                      item.badge === 'REAL'
                        ? isActive
                          ? 'bg-white/15 text-white border border-white/25'
                          : 'bg-teal-500/15 text-teal-300 border border-teal-500/25'
                        : isActive
                        ? 'bg-white/15 text-slate-100 border border-white/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Dedicated Impersonation Boundary Entry */}
          {canImpersonate && (
            <div className="pt-5 pb-2">
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Privileged Workflow</span>
              </div>
              <button
                onClick={() => {
                  onOpenImpersonation();
                  if (onClose) onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-[12px] bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 hover:text-amber-200 transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <div className="flex items-center gap-2 truncate">
                  <UserCheck2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">Impersonation Gate</span>
                </div>
                <span className="text-[9px] bg-amber-500/20 text-amber-200 border border-amber-400/30 px-1.5 py-0.5 rounded-[6px] font-bold font-mono shrink-0">
                  STEP-UP
                </span>
              </button>
              <p className="px-3 pt-1.5 text-[10px] text-slate-400 leading-tight font-sans">
                Audit-supervised platform staff access
              </p>
            </div>
          )}
        </nav>

        {/* Staff Identity Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between text-xs">
            <div className="truncate">
              <p className="text-white font-semibold truncate font-display">
                {user?.fullName || 'Platform Staff'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono truncate">{user?.email}</p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-[8px] bg-slate-800 text-teal-300 border border-slate-700 font-medium truncate">
              {user?.platformRole}
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-semibold whitespace-nowrap">
              {user?.mfaVerified ? 'MFA VERIFIED' : 'STAFF AUTH'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
