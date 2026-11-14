import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Database,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { getRouteTitle, PLATFORM_ROUTES } from '../../app/routes.ts';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';

interface TopBarProps {
  isDbConnected: boolean;
  dbLatencyMs?: number | null;
  onOpenDbDetails: () => void;
  onOpenMobileMenu: () => void;
  onOpenMfaSetup: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isDbConnected,
  dbLatencyMs,
  onOpenDbDetails,
  onOpenMobileMenu,
  onOpenMfaSetup,
}) => {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const pageTitle = getRouteTitle(location.pathname);
  const canReadSecurity = hasPermission(PLATFORM_PERMISSIONS.SECURITY_READ);

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 z-20 shrink-0">
      {/* Left: Mobile Menu Button + Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center -ml-1 rounded-[10px] text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C] shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="hidden sm:inline font-mono text-slate-500 font-semibold tracking-wider text-[11px] whitespace-nowrap">
            DIALPULSE CENTRAL
          </span>
          <span className="hidden sm:inline text-slate-300">/</span>
          <span className="font-display font-bold text-slate-900 tracking-tight text-sm truncate">
            {pageTitle}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Database Status Button */}
        <button
          onClick={onOpenDbDetails}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[10px] text-xs font-mono border transition-all duration-150 cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C] ${
            isDbConnected
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100/70'
              : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/70'
          }`}
          title="Click for Database Connection & Schema details"
        >
          <Database className={`w-3.5 h-3.5 shrink-0 ${isDbConnected ? 'text-emerald-700' : 'text-amber-700'}`} />
          <span className="hidden md:inline font-medium text-[11px]">
            {isDbConnected ? 'PostgreSQL: Active' : 'Standalone Mode'}
          </span>
          <span className="md:hidden font-medium text-[11px]">
            {isDbConnected ? 'DB Up' : 'Standalone'}
          </span>
          {dbLatencyMs != null && (
            <span className="hidden sm:inline text-[10px] text-[#00695C] border-l border-emerald-200 pl-1.5 font-semibold tabular-nums">
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
            className="relative min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-[10px] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C]"
            title="Platform Alerts & Notifications"
            aria-label="Platform Alerts and Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 sm:top-1.5 sm:right-1.5 w-2 h-2 bg-[#00695C] rounded-full ring-2 ring-white" />
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-white rounded-[18px] border border-slate-200 shadow-xl z-30 overflow-hidden text-xs">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <span className="font-display font-bold text-slate-900">Platform Notifications</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[6px] bg-teal-50 text-[#00695C] border border-teal-200">
                    LIVE
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  <div className="p-2.5 rounded-[12px] bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                    {isDbConnected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">
                        {isDbConnected ? 'PostgreSQL Connected' : 'Standalone Evaluation Active'}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                        {isDbConnected
                          ? 'Authoritative persistence pool is responsive.'
                          : 'Set DATABASE_URL to enable live PostgreSQL persistence.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-[12px] bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#00695C] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">
                        Session Security · {user?.mfaVerified ? 'MFA Verified' : 'Password Session'}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                        {user?.mfaVerified
                          ? 'Two-factor verification active for this platform session.'
                          : 'Configure authenticator TOTP in your profile menu for step-up protection.'}
                      </p>
                    </div>
                  </div>
                </div>
                {canReadSecurity && (
                  <div className="px-3 py-2.5 border-t border-slate-200 bg-slate-50 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate(PLATFORM_ROUTES.SECURITY);
                      }}
                      className="text-xs font-semibold text-[#00695C] hover:underline cursor-pointer"
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
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-[12px] hover:bg-slate-100 border border-slate-200 bg-white transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00695C]"
          >
            <div className="w-7 h-7 rounded-[9px] bg-[#00695C] text-white flex items-center justify-center font-bold text-xs font-display shrink-0">
              {user?.fullName?.charAt(0) || 'P'}
            </div>
            <div className="hidden sm:block text-xs max-w-[140px]">
              <div className="font-semibold text-slate-900 leading-none truncate">{user?.fullName}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{user?.platformRole}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {profileDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setProfileDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-white rounded-[18px] border border-slate-200 shadow-xl z-30 py-2 text-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <p className="font-display font-bold text-slate-900">{user?.fullName}</p>
                  <p className="font-mono text-slate-500 text-[11px] truncate">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-[8px] bg-teal-50 text-[#00695C] border border-teal-200">
                      {user?.platformRole}
                    </span>
                    {user?.mfaVerified && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-[8px] bg-emerald-50 text-emerald-800 border border-emerald-200">
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
                    className="w-full flex items-center gap-2 px-3 py-2 text-[#00695C] hover:bg-teal-50 rounded-[10px] transition-colors cursor-pointer font-semibold"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#00695C]" />
                    <span>Configure Authenticator MFA</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      navigate(PLATFORM_ROUTES.PRIVACY_POLICY);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-[10px] transition-colors cursor-pointer font-semibold"
                  >
                    <Scale className="w-3.5 h-3.5 text-slate-500" />
                    <span>Privacy Policy & IT Act Notice</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[#BA1A1A] hover:bg-red-50 rounded-[10px] transition-colors cursor-pointer font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#BA1A1A]" />
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
