import React from 'react';

interface StatusChipProps {
  status: string;
  type?: 'tenant' | 'severity' | 'audit' | 'system' | 'role';
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, type = 'tenant', size = 'sm' }) => {
  const s = String(status).toLowerCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';
  let label = status;

  if (type === 'tenant') {
    if (s === 'active') {
      styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      dotColor = 'bg-emerald-500';
      label = 'Active';
    } else if (s === 'suspended') {
      styles = 'bg-rose-50 text-rose-800 border-rose-200';
      dotColor = 'bg-rose-500';
      label = 'Suspended';
    } else if (s === 'provisioning') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200';
      dotColor = 'bg-amber-500 animate-pulse';
      label = 'Provisioning';
    } else if (s === 'deprovisioned') {
      styles = 'bg-slate-100 text-slate-500 border-slate-300';
      dotColor = 'bg-slate-400';
      label = 'Deprovisioned';
    }
  } else if (type === 'severity') {
    if (s === 'critical') {
      styles = 'bg-red-100 text-red-900 border-red-300 font-semibold';
      dotColor = 'bg-red-600 animate-ping';
      label = 'Critical';
    } else if (s === 'high') {
      styles = 'bg-rose-50 text-rose-800 border-rose-200';
      dotColor = 'bg-rose-500';
      label = 'High';
    } else if (s === 'medium') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200';
      dotColor = 'bg-amber-500';
      label = 'Medium';
    } else {
      styles = 'bg-sky-50 text-sky-800 border-sky-200';
      dotColor = 'bg-sky-500';
      label = 'Low';
    }
  } else if (type === 'audit') {
    if (s === 'success') {
      styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      dotColor = 'bg-emerald-500';
      label = 'SUCCESS';
    } else if (s === 'denied') {
      styles = 'bg-amber-50 text-amber-800 border-amber-300 font-medium';
      dotColor = 'bg-amber-500';
      label = 'DENIED (403)';
    } else {
      styles = 'bg-rose-50 text-rose-800 border-rose-200';
      dotColor = 'bg-rose-500';
      label = 'FAILED';
    }
  } else if (type === 'role') {
    if (s === 'platform_admin') {
      styles = 'bg-purple-50 text-purple-900 border-purple-200 font-medium';
      dotColor = 'bg-purple-600';
      label = 'Platform Admin';
    } else if (s === 'platform_support') {
      styles = 'bg-teal-50 text-teal-900 border-teal-200 font-medium';
      dotColor = 'bg-teal-600';
      label = 'Platform Support';
    } else if (s === 'platform_security') {
      styles = 'bg-amber-50 text-amber-900 border-amber-200 font-medium';
      dotColor = 'bg-amber-600';
      label = 'Platform Security';
    }
  } else if (type === 'system') {
    if (s === 'connected' || s === 'healthy') {
      styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      dotColor = 'bg-emerald-500';
    } else if (s === 'warning' || s === 'awaiting_database') {
      styles = 'bg-amber-50 text-amber-800 border-amber-200';
      dotColor = 'bg-amber-500';
    } else {
      styles = 'bg-rose-50 text-rose-800 border-rose-200';
      dotColor = 'bg-rose-500';
    }
  }

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border ${paddingClass} font-mono tracking-tight ${styles}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
};
