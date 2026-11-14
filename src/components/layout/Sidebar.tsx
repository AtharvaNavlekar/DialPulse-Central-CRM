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
          className="fixed inset-0 z-30 bg-[#282820]/50 backdrop-blur-[1px] lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-68 bg-[#175E17] text-white flex flex-col h-screen border-r border-[#114711] select-none shrink-0 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-[0_12px_36px_rgba(40,40,32,0.3)]' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-[#228B22]/45 bg-[#114711] flex items-center justify-between gap-2">
          <Logo variant="dark" size="sm" showSubtitle={true} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-[10px] text-[#E5C8B2] hover:text-white hover:bg-[#228B22]/40 transition-colors cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Platform navigation">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#E5C8B2]/80 font-mono">
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
                className={`relative w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-[12px] transition-all duration-150 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6347] ${
                  isActive
                    ? 'bg-[#FAF3ED] text-[#175E17] font-bold shadow-[0_2px_10px_rgba(17,71,17,0.28)]'
                    : 'text-[#F0F7F0] hover:bg-[#228B22]/55 hover:text-white font-medium'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-[#FF6347]"
                    aria-hidden="true"
                  />
                )}

                <div className={`flex items-center gap-2.5 truncate ${isActive ? 'pl-1.5' : ''}`}>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#175E17]' : 'text-[#E5C8B2]/90 group-hover:text-white'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded-[6px] font-bold uppercase tracking-wider shrink-0 ${
                      item.badge === 'REAL'
                        ? isActive
                          ? 'bg-[#E6F2E6] text-[#175E17] border border-[#228B22]/30'
                          : 'bg-[#114711] text-[#E5C8B2] border border-[#228B22]/50'
                        : isActive
                        ? 'bg-[#F5E9DF] text-[#5C554D] border border-[#CBB5A4]'
                        : 'bg-[#114711]/70 text-[#E5C8B2]/75 border border-[#228B22]/30'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Dedicated Impersonation Boundary Entry (10% Tomato Red Accent CTA) */}
          {canImpersonate && (
            <div className="pt-5 pb-2">
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#E5C8B2]/90 flex items-center gap-1.5 font-mono">
                <Lock className="w-3 h-3 text-[#FF6347]" />
                <span>Privileged Workflow</span>
              </div>
              <button
                onClick={() => {
                  onOpenImpersonation();
                  if (onClose) onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-[12px] bg-[#FF6347] text-[#282820] hover:bg-[#F25236] transition-all duration-150 shadow-[0_4px_12px_rgba(40,40,32,0.22)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <div className="flex items-center gap-2 truncate">
                  <UserCheck2 className="w-4 h-4 text-[#282820] shrink-0" />
                  <span className="truncate">Impersonation Gate</span>
                </div>
                <span className="text-[9px] bg-[#282820] text-[#FAF3ED] px-1.5 py-0.5 rounded-[6px] font-bold font-mono shrink-0">
                  STEP-UP
                </span>
              </button>
              <p className="px-3 pt-1.5 text-[10px] text-[#E5C8B2]/80 leading-tight font-sans">
                Audit-supervised platform staff access
              </p>
            </div>
          )}
        </nav>

        {/* Staff Identity Footer */}
        <div className="p-3.5 border-t border-[#228B22]/45 bg-[#114711]">
          <div className="flex items-center justify-between text-xs">
            <div className="truncate">
              <p className="text-white font-semibold truncate font-display">
                {user?.fullName || 'Platform Staff'}
              </p>
              <p className="text-[11px] text-[#E5C8B2]/85 font-mono truncate">{user?.email}</p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-[8px] bg-[#175E17] text-[#FAF3ED] border border-[#2E9E2E]/50 font-medium truncate">
              {user?.platformRole}
            </span>
            <span className="text-[10px] text-[#E5C8B2] font-mono font-semibold whitespace-nowrap">
              {user?.mfaVerified ? 'MFA VERIFIED' : 'STAFF AUTH'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
