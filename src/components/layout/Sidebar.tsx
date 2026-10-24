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
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenImpersonation,
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

  return (
    <aside className="w-64 bg-white text-slate-800 flex flex-col h-screen border-r border-[#E2E8F0] select-none shrink-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white">
        <Logo variant="light" size="sm" showSubtitle={true} />

        <div className="mt-3.5 flex items-center justify-between px-2.5 py-1.5 bg-[#F8FAF9] rounded-xl text-[11px] text-slate-500 border border-[#E2E8F0]">
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>SYS: STANDALONE</span>
          </span>
          <span className="font-mono text-[10px] text-[#00695C] font-semibold">v1.0</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
          Core Operations
        </div>

        {navItems.map((item) => {
          const hasAccess = hasPermission(item.permission);
          const isActive = currentTab === item.key;
          const Icon = item.icon;

          if (!hasAccess) {
            // Frontend visibility reflects permission, backend rejects regardless
            return null;
          }

          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl transition-colors text-left group cursor-pointer ${
                isActive
                  ? 'bg-[#E6F4F1] text-[#00695C] font-semibold'
                  : 'text-slate-600 hover:bg-[#F1F5F4] hover:text-slate-900 font-medium'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#00695C]' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                    item.badge === 'REAL'
                      ? isActive
                        ? 'bg-[#CCE8E1] text-[#00201B]'
                        : 'bg-teal-50 text-[#00695C] border border-teal-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
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
          <div className="pt-4 pb-2">
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3 text-amber-600" />
              <span>Privileged Workflow</span>
            </div>
            <button
              onClick={onOpenImpersonation}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 hover:bg-amber-100 hover:text-amber-950 transition-colors shadow-2xs cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <UserCheck2 className="w-4 h-4 text-amber-700" />
                <span>Supervised Impersonation</span>
              </div>
              <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold font-mono">
                GATE
              </span>
            </button>
            <p className="px-3 pt-1 text-[10px] text-slate-500 leading-tight font-sans">
              Audit-supervised platform staff access
            </p>
          </div>
        )}
      </nav>

      {/* Staff Identity Footer */}
      <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAF9]">
        <div className="flex items-center justify-between text-xs">
          <div className="truncate">
            <p className="text-slate-900 font-semibold truncate font-display">{user?.fullName || 'Platform Staff'}</p>
            <p className="text-[11px] text-slate-500 font-mono truncate">{user?.email}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-teal-50 text-[#00695C] border border-teal-200 font-medium">
            {user?.platformRole}
          </span>
          <span className="text-[10px] text-emerald-700 font-mono font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            STAFF AUTH
          </span>
        </div>
      </div>
    </aside>
  );
};
