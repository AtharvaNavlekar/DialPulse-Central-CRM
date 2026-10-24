import React, { useState } from 'react';
import {
  Database,
  Bell,
  LogOut,
  ChevronDown,
  UserCheck,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { PlatformRole } from '../../app/types.ts';

interface TopBarProps {
  currentTabName: string;
  isDbConnected: boolean;
  dbLatencyMs?: number | null;
  onOpenDbDetails: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTabName,
  isDbConnected,
  dbLatencyMs,
  onOpenDbDetails,
}) => {
  const { user, logout, switchRoleQuick } = useAuth();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleRoleSwitch = async (role: PlatformRole) => {
    setSwitching(true);
    try {
      await switchRoleQuick(role);
      setProfileDropdownOpen(false);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] px-6 flex items-center justify-between z-10 shrink-0">
      {/* Breadcrumb / Location */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-slate-400 font-semibold tracking-wider text-[11px]">DIALPULSE CENTRAL</span>
        <span className="text-slate-300">/</span>
        <span className="font-display font-bold text-slate-900 capitalize tracking-tight text-sm">
          {currentTabName === 'overview' ? 'Dashboard' : currentTabName}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Database Status Button */}
        <button
          onClick={onOpenDbDetails}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border transition-all cursor-pointer ${
            isDbConnected
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100/70'
              : 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100/70'
          }`}
          title="Click for Database Connection & Schema details"
        >
          <Database className={`w-3.5 h-3.5 ${isDbConnected ? 'text-emerald-600' : 'text-amber-600'}`} />
          <span className="font-medium text-[11px]">
            {isDbConnected ? 'PostgreSQL: Active' : 'DATABASE_URL: Unset (Standalone)'}
          </span>
          {dbLatencyMs != null && (
            <span className="text-[10px] text-emerald-700 border-l border-emerald-300 pl-1 font-semibold">
              {dbLatencyMs}ms
            </span>
          )}
        </button>

        {/* System Notifications */}
        <button
          className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-[#F1F5F4] rounded-xl transition-colors cursor-pointer"
          title="Platform Alerts & Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#00695C] rounded-full" />
        </button>

        {/* Platform Staff User Menu & Role Switcher */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 pl-2 pr-2 py-1 rounded-xl hover:bg-[#F1F5F4] border border-[#E2E8F0] transition-colors text-left cursor-pointer"
          >
            <div className="w-7 h-7 rounded-xl bg-[#00695C] text-white flex items-center justify-center font-bold text-xs font-display">
              {user?.fullName?.charAt(0) || 'P'}
            </div>
            <div className="hidden sm:block text-xs">
              <div className="font-semibold text-slate-900 leading-none">{user?.fullName}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">{user?.platformRole}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setProfileDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-[#E2E8F0] shadow-lg z-30 py-2 text-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-[#F8FAF9]">
                  <p className="font-display font-bold text-slate-900">{user?.fullName}</p>
                  <p className="font-mono text-slate-500 text-[11px] truncate">{user?.email}</p>
                  <div className="mt-2 inline-block">
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-lg bg-teal-50 text-[#00695C] border border-teal-200">
                      Authoritative: {user?.platformRole}
                    </span>
                  </div>
                </div>

                {/* Development-Only Role Switcher - Excluded in Production */}
                {import.meta.env.DEV && (
                  <div className="px-3 py-2.5 border-b border-slate-100">
                    <div className="text-[10px] uppercase font-mono font-bold text-slate-400 mb-2 flex items-center justify-between">
                      <span>[DEV ONLY] Test RBAC Roles:</span>
                      {switching && <span className="text-[#00695C] animate-pulse font-sans">Switching...</span>}
                    </div>
                    <div className="space-y-1">
                      <button
                        onClick={() => handleRoleSwitch('platform_admin')}
                        disabled={switching}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left cursor-pointer transition-colors ${
                          user?.platformRole === 'platform_admin'
                            ? 'bg-teal-50 text-[#00695C] font-semibold border border-teal-200'
                            : 'hover:bg-[#F1F5F4] text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-[#00695C]" />
                          <span>Platform Admin</span>
                        </div>
                        {user?.platformRole === 'platform_admin' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00695C]" />
                        )}
                      </button>

                      <button
                        onClick={() => handleRoleSwitch('platform_support')}
                        disabled={switching}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left cursor-pointer transition-colors ${
                          user?.platformRole === 'platform_support'
                            ? 'bg-teal-50 text-[#00695C] font-semibold border border-teal-200'
                            : 'hover:bg-[#F1F5F4] text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-[#00695C]" />
                          <span>Platform Support</span>
                        </div>
                        {user?.platformRole === 'platform_support' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00695C]" />
                        )}
                      </button>

                      <button
                        onClick={() => handleRoleSwitch('platform_security')}
                        disabled={switching}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left cursor-pointer transition-colors ${
                          user?.platformRole === 'platform_security'
                            ? 'bg-teal-50 text-[#00695C] font-semibold border border-teal-200'
                            : 'hover:bg-[#F1F5F4] text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-[#00695C]" />
                          <span>Platform Security</span>
                        </div>
                        {user?.platformRole === 'platform_security' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00695C]" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-1.5">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[#BA1A1A] hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#BA1A1A]" />
                    <span className="font-medium">Sign Out Platform Session</span>
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
