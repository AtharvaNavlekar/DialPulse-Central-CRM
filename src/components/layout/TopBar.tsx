import React, { useState } from 'react';
import {
  Database,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';

interface TopBarProps {
  currentTabName: string;
  isDbConnected: boolean;
  dbLatencyMs?: number | null;
  onOpenDbDetails: () => void;
  onOpenMobileMenu: () => void;
  onOpenMfaSetup: () => void;
  onNavigateToSecurity?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTabName,
  isDbConnected,
  dbLatencyMs,
  onOpenDbDetails,
  onOpenMobileMenu,
  onOpenMfaSetup,
  onNavigateToSecurity,
}) => {
  const { user, logout } = useAuth();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const tabTitles: Record<string, string> = {
    overview: 'Dashboard',
    tenants: 'Tenants',
    security: 'Security / SOC',
    audit: 'Global Audit',
    staff: 'Platform Staff & RBAC',
    billing: 'Billing & Plans',
    support: 'Platform Support',
    features: 'Feature Toggles',
    infrastructure: 'Infrastructure & Ops',
    analytics: 'Platform Analytics',
  };

  return (
    <header className="h-14 bg-[#FAF3ED] border-b border-[#CBB5A4] px-4 sm:px-6 flex items-center justify-between gap-4 z-20 shrink-0">
      {/* Left: Mobile Menu Button + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 rounded-[10px] text-[#282820] hover:bg-[#E5C8B2]/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="hidden sm:inline font-mono text-[#5C554D] font-semibold tracking-wider text-[11px] whitespace-nowrap">
            DIALPULSE CENTRAL
          </span>
          <span className="hidden sm:inline text-[#B39B88]">/</span>
          <span className="font-display font-bold text-[#282820] tracking-tight text-sm truncate">
            {tabTitles[currentTabName] || currentTabName}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Database Status Button */}
        <button
          onClick={onOpenDbDetails}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[10px] text-xs font-mono border transition-all duration-150 cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22] ${
            isDbConnected
              ? 'bg-[#E5F4E8] text-[#114E1E] border-[#A7D7B0] hover:bg-[#D5EBD9]'
              : 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B] hover:bg-[#FCE8C5]'
          }`}
          title="Click for Database Connection & Schema details"
        >
          <Database className={`w-3.5 h-3.5 shrink-0 ${isDbConnected ? 'text-[#176B2A]' : 'text-[#8A4B08]'}`} />
          <span className="hidden md:inline font-medium text-[11px]">
            {isDbConnected ? 'PostgreSQL: Active' : 'Standalone Mode'}
          </span>
          <span className="md:hidden font-medium text-[11px]">
            {isDbConnected ? 'DB Up' : 'Standalone'}
          </span>
          {dbLatencyMs != null && (
            <span className="hidden sm:inline text-[10px] text-[#175E17] border-l border-[#A7D7B0] pl-1.5 font-semibold tabular-nums">
              {dbLatencyMs}ms
            </span>
          )}
        </button>

        {/* System Notifications Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setProfileDropdownOpen(false);
            }}
            className="relative p-2 text-[#5C554D] hover:text-[#282820] hover:bg-[#ECD9C8] rounded-[10px] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22]"
            title="Platform Alerts & Notifications"
            aria-label="Platform Alerts and Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF6347] rounded-full ring-2 ring-[#FAF3ED]" />
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-[#FAF3ED] rounded-[18px] border border-[#CBB5A4] shadow-[0_12px_32px_rgba(40,40,32,0.16)] z-30 overflow-hidden text-xs">
                <div className="px-4 py-3 border-b border-[#DFCBB9] bg-[#F5E9DF] flex items-center justify-between">
                  <span className="font-display font-bold text-[#282820]">Platform Notifications</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[6px] bg-[#FF6347] text-[#282820]">
                    LIVE
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  <div className="p-2.5 rounded-[12px] bg-[#F5E9DF] border border-[#DFCBB9] flex items-start gap-2.5">
                    {isDbConnected ? (
                      <CheckCircle2 className="w-4 h-4 text-[#176B2A] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[#8A4B08] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold text-[#282820]">
                        {isDbConnected ? 'PostgreSQL Connected' : 'Standalone Evaluation Active'}
                      </p>
                      <p className="text-[11px] text-[#5C554D] mt-0.5 leading-snug">
                        {isDbConnected
                          ? 'Authoritative persistence pool is responsive.'
                          : 'Set DATABASE_URL to enable live PostgreSQL persistence.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-[12px] bg-[#F5E9DF] border border-[#DFCBB9] flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#175E17] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#282820]">
                        Session Security · {user?.mfaVerified ? 'MFA Verified' : 'Password Session'}
                      </p>
                      <p className="text-[11px] text-[#5C554D] mt-0.5 leading-snug">
                        {user?.mfaVerified
                          ? 'Two-factor verification active for this platform session.'
                          : 'Configure authenticator TOTP in your profile menu for step-up protection.'}
                      </p>
                    </div>
                  </div>
                </div>
                {onNavigateToSecurity && (
                  <div className="px-3 py-2.5 border-t border-[#DFCBB9] bg-[#F5E9DF] flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        onNavigateToSecurity();
                      }}
                      className="text-xs font-semibold text-[#175E17] hover:underline cursor-pointer"
                    >
                      Open Security / SOC Feed →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Platform Staff User Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setProfileDropdownOpen(!profileDropdownOpen);
              setNotificationsOpen(false);
            }}
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-[12px] hover:bg-[#ECD9C8] border border-[#CBB5A4] bg-[#F5E9DF]/60 transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#228B22]"
          >
            <div className="w-7 h-7 rounded-[9px] bg-[#175E17] text-white flex items-center justify-center font-bold text-xs font-display shrink-0">
              {user?.fullName?.charAt(0) || 'P'}
            </div>
            <div className="hidden sm:block text-xs max-w-[140px]">
              <div className="font-semibold text-[#282820] leading-none truncate">{user?.fullName}</div>
              <div className="text-[10px] font-mono text-[#5C554D] mt-0.5 truncate">{user?.platformRole}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#5C554D] shrink-0" />
          </button>

          {profileDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setProfileDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-72 bg-[#FAF3ED] rounded-[18px] border border-[#CBB5A4] shadow-[0_12px_32px_rgba(40,40,32,0.16)] z-30 py-2 text-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-[#DFCBB9] bg-[#F5E9DF]">
                  <p className="font-display font-bold text-[#282820]">{user?.fullName}</p>
                  <p className="font-mono text-[#5C554D] text-[11px] truncate">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-[8px] bg-[#E6F2E6] text-[#175E17] border border-[#228B22]/30">
                      {user?.platformRole}
                    </span>
                    {user?.mfaVerified && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-[8px] bg-[#E5F4E8] text-[#114E1E] border border-[#A7D7B0]">
                        MFA Active
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-1.5 space-y-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onOpenMfaSetup();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[#175E17] hover:bg-[#E6F2E6] rounded-[10px] transition-colors cursor-pointer font-semibold"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#175E17]" />
                    <span>Configure Authenticator MFA</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[#A61B1B] hover:bg-[#FDECEC] rounded-[10px] transition-colors cursor-pointer font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#A61B1B]" />
                    <span>Sign Out Platform Session</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
