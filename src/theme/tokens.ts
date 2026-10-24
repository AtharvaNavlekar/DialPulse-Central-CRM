/**
 * DialPulse Central CRM — Design Token Layer
 * Canonical White / Light Enterprise Control Center System
 * Reference Brand: DialPulse-Web (https://github.com/AtharvaNavlekar/DialPulse-Web.git)
 */

export const tokens = {
  colors: {
    // Page & Canvas
    pageBackground: '#FFFFFF',
    workspaceBackground: '#F8FAF9',

    // Surfaces
    surface: '#FFFFFF',
    surfaceSecondary: '#F8FAF9',
    surfaceSubtle: '#F4F7F6',
    surfaceHover: '#F1F5F4',

    // Text & Content
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',

    // DialPulse Signature Brand
    primary: '#00695C',
    primaryHover: '#004D40',
    primaryContainer: '#CCE8E1',
    onPrimaryContainer: '#00201B',
    focusRing: '#00695C',

    // Structural Borders
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',

    // Semantic States
    success: '#10B981',
    successBg: '#ECFDF5',
    successBorder: '#A7F3D0',
    successText: '#065F46',

    warning: '#D97706',
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
    warningText: '#92400E',

    error: '#BA1A1A',
    errorBg: '#FEF2F2',
    errorBorder: '#FECACA',
    errorText: '#991B1B',

    info: '#0284C7',
    infoBg: '#F0F9FF',
    infoBorder: '#BAE6FD',
    infoText: '#075985',
  },

  radii: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    full: '9999px',
  },

  shadows: {
    none: 'none',
    subtle: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
    card: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
    dropdown: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
    modal: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.05)',
  },

  typography: {
    fontDisplay: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    fontBody: "'Roboto', ui-sans-serif, system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
  },
} as const;

export type ThemeTokens = typeof tokens;
