import React from 'react';

interface StatusChipProps {
  status: string;
  type?: 'tenant' | 'severity' | 'audit' | 'system' | 'role';
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, type = 'tenant', size = 'sm' }) => {
  const s = String(status).toLowerCase();

  let styles = 'bg-slate-100 text-slate-600 border-slate-200';
  let dotColor = 'bg-slate-400';
  let label = status;

  if (type === 'tenant') {
    if (s === 'active') {
      styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      dotColor = 'bg-emerald-600';
      label = 'Active';
    } else if (s === 'suspended') {
      styles = 'bg-red-50 text-[#BA1A1A] border-red-200';
      dotColor = 'bg-[#BA1A1A]';
      label = 'Suspended';
    } else if (s === 'provisioning') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200';
      dotColor = 'bg-amber-500';
      label = 'Provisioning';
    } else if (s === 'deprovisioned') {
      styles = 'bg-slate-100 text-slate-600 border-slate-200';
      dotColor = 'bg-slate-400';
      label = 'Deprovisioned';
    }
  } else if (type === 'severity') {
    if (s === 'critical') {
      styles = 'bg-red-50 text-[#BA1A1A] border-red-200 font-semibold';
      dotColor = 'bg-[#BA1A1A]';
      label = 'Critical';
    } else if (s === 'high') {
      styles = 'bg-orange-50 text-orange-800 border-orange-200 font-semibold';
      dotColor = 'bg-orange-500';
      label = 'High';
    } else if (s === 'medium') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200';
      dotColor = 'bg-amber-500';
      label = 'Medium';
    } else {
      styles = 'bg-sky-50 text-sky-800 border-sky-200';
      dotColor = 'bg-sky-600';
      label = 'Low';
    }
  } else if (type === 'audit') {
    if (s === 'success') {
      styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      dotColor = 'bg-emerald-600';
      label = 'SUCCESS';
    } else if (s === 'denied') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
      dotColor = 'bg-amber-600';
      label = 'DENIED (403)';
    } else {
      styles = 'bg-red-50 text-[#BA1A1A] border-red-200';
      dotColor = 'bg-[#BA1A1A]';
      label = 'FAILED';
    }
  } else if (type === 'role') {
    if (s === 'platform_admin') {
      styles = 'bg-teal-50 text-[#00695C] border-teal-200 font-semibold';
      dotColor = 'bg-[#00695C]';
      label = 'Platform Admin';
    } else if (s === 'platform_support') {
      styles = 'bg-sky-50 text-sky-800 border-sky-200 font-semibold';
      dotColor = 'bg-sky-600';
      label = 'Platform Support';
    } else if (s === 'platform_security') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200 font-semibold';
      dotColor = 'bg-amber-600';
      label = 'Platform Security';
    }
  } else if (type === 'system') {
    if (s === 'connected' || s === 'healthy') {
      styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      dotColor = 'bg-emerald-600';
    } else if (s === 'warning' || s === 'awaiting_database') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200';
      dotColor = 'bg-amber-500';
    } else {
      styles = 'bg-red-50 text-[#BA1A1A] border-red-200';
      dotColor = 'bg-[#BA1A1A]';
    }
  }

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[8px] border ${paddingClass} font-mono tracking-tight whitespace-nowrap ${styles}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
