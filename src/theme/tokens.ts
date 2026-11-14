/**
 * DialPulse Central CRM — Design Token Layer
 * Official 60 / 30 / 10 Brand Architecture:
 *   60% MAIN:   Oat Milk (#E5C8B2) + warm Oat surface hierarchy
 *   30% SECOND: Forest Green (#228B22 / accessible #175E17)
 *   10% ACCENT: Tomato Red (#FF6347)
 */

export const tokens = {
  brand: {
    oatMilk: '#E5C8B2',
    forestGreen: '#228B22',
    forestGreenDeep: '#175E17',
    forestGreenDark: '#114711',
    tomatoRed: '#FF6347',
    tomatoRedHover: '#F25236',
  },

  colors: {
    // 60% Main Canvas & Warm Surfaces
    pageBackground: '#E5C8B2',
    workspaceBackground: '#E5C8B2',
    surface: '#F5E9DF',
    surfaceRaised: '#FAF3ED',
    surfaceInset: '#ECD9C8',
    surfaceHover: '#EEDBCC',

    // Text & Accessibility (WCAG AA+)
    textPrimary: '#282820',
    textSecondary: '#5C554D',
    textMuted: '#6E665D',
    textOnGreen: '#FFFFFF',
    textOnTomato: '#282820',

    // 30% Secondary Brand Structure (Forest Green)
    secondary: '#228B22',
    secondaryAccessible: '#175E17',
    secondaryHover: '#114711',
    secondaryContainer: '#E6F2E6',
    onSecondaryContainer: '#114711',

    // 10% Accent (Tomato Red)
    accent: '#FF6347',
    accentHover: '#F25236',
    accentTint: '#FFEAE6',

    // Structural Borders & Focus
    border: '#CBB5A4',
    borderSubtle: '#DFCBB9',
    borderStrong: '#B39B88',
    focusRing: '#228B22',

    // Distinct Semantic Status Colors
    success: '#176B2A',
    successBg: '#E5F4E8',
    successBorder: '#A7D7B0',
    successText: '#114E1E',

    warning: '#8A4B08',
    warningBg: '#FEF3DF',
    warningBorder: '#E8C48B',
    warningText: '#6F3B05',

    error: '#A61B1B',
    errorBg: '#FDECEC',
    errorBorder: '#EAB5B5',
    errorText: '#7E1414',

    info: '#165E7D',
    infoBg: '#E8F4FA',
    infoBorder: '#A8D2E5',
    infoText: '#0F455C',
  },

  radii: {
    control: '12px',
    card: '18px',
    modal: '20px',
    full: '9999px',
  },

  shadows: {
    none: 'none',
    subtle: '0 2px 6px rgba(40, 40, 32, 0.05)',
    card: '0 4px 18px rgba(40, 40, 32, 0.08)',
    elevated: '0 10px 28px rgba(40, 40, 32, 0.12)',
  },

  typography: {
    fontDisplay: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    fontBody: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
  },
} as const;

export type ThemeTokens = typeof tokens;
