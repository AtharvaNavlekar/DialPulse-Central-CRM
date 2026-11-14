/**
 * DialPulse Central CRM — Design Token Layer
 * Editorial Light Palette:
 *   Primary:    #00695C (Deep Teal) / #004D40 hover / #CCE8E1 container
 *   Background: #F8FAF9 (Editorial Surface) & #FFFFFF (Cards)
 *   Text:       #0F172A (Primary) / #475569 (Secondary)
 *   Error:      #BA1A1A / #FFDAD6 container
 */

export const tokens = {
  brand: {
    primary: '#00695C',
    primaryHover: '#004D40',
    primaryContainer: '#CCE8E1',
    onPrimaryContainer: '#00201B',
    secondary: '#4A635D',
    tertiary: '#006558',
  },

  colors: {
    // Editorial Light Surfaces
    pageBackground: '#F8FAF9',
    workspaceBackground: '#F8FAF9',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceInset: '#F1F5F4',
    surfaceHover: '#E2E8F0',

    // Text & Accessibility
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textOnPrimary: '#FFFFFF',

    // Primary Brand Structure
    primary: '#00695C',
    primaryHover: '#004D40',
    primaryContainer: '#CCE8E1',
    onPrimaryContainer: '#00201B',

    // Structural Borders & Focus
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    borderStrong: '#CBD5E1',
    focusRing: '#00695C',

    // Semantic Status Colors
    success: '#047857',
    successBg: '#ECFDF5',
    successBorder: '#A7F3D0',
    successText: '#065F46',

    warning: '#B45309',
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
    warningText: '#92400E',

    error: '#BA1A1A',
    errorBg: '#FEF2F2',
    errorBorder: '#FECACA',
    errorText: '#991B1B',

    info: '#0369A1',
    infoBg: '#F0F9FF',
    infoBorder: '#BAE6FD',
    infoText: '#075985',
  },

  radii: {
    control: '12px',
    card: '16px',
    modal: '20px',
    full: '9999px',
  },

  shadows: {
    none: 'none',
    subtle: '0 1px 3px rgba(15, 23, 42, 0.05)',
    card: '0 4px 16px rgba(15, 23, 42, 0.06)',
    elevated: '0 10px 28px rgba(15, 23, 42, 0.10)',
  },

  typography: {
    fontDisplay: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    fontBody: "'Roboto', ui-sans-serif, system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
  },
} as const;

export type ThemeTokens = typeof tokens;
