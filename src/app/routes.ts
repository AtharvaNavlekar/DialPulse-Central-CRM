import { PLATFORM_PERMISSIONS, PlatformPermission } from '../server/policies/permissions.ts';

export const PLATFORM_ROUTES = {
  ROOT: '/',
  LOGIN: '/login',
  PRIVACY_POLICY: '/privacy-policy',
  OVERVIEW: '/overview',
  TENANTS: '/tenants',
  SECURITY: '/security',
  AUDIT: '/audit',
  STAFF: '/staff',
  BILLING: '/billing',
  SUPPORT: '/support',
  CONFIGURATION: '/configuration',
  INFRASTRUCTURE: '/infrastructure',
  ANALYTICS: '/analytics',
} as const;

export type PlatformRoutePath = (typeof PLATFORM_ROUTES)[keyof typeof PLATFORM_ROUTES];

/**
 * Future roadmap routes reserved by the approved Page Development Roadmap.
 * Intentionally NOT implemented with placeholder/fake detail views in Sprint 01;
 * requests to these paths render the standard NotFoundPage.
 */
export const RESERVED_FUTURE_ROUTES = [
  '/tenants/:tenantId',
  '/security/sessions',
  '/account/security',
  '/compliance',
] as const;

export type NavItemKey =
  | 'overview'
  | 'tenants'
  | 'security'
  | 'audit'
  | 'staff'
  | 'billing'
  | 'support'
  | 'features'
  | 'infrastructure'
  | 'analytics';

export interface RouteMeta {
  key: NavItemKey;
  path: PlatformRoutePath;
  title: string;
  permission: PlatformPermission;
  badge: 'REAL' | 'PLANNED';
  unimplemented?: boolean;
}

export const PLATFORM_NAV_ROUTES: RouteMeta[] = [
  {
    key: 'overview',
    path: PLATFORM_ROUTES.OVERVIEW,
    title: 'Dashboard',
    permission: PLATFORM_PERMISSIONS.OVERVIEW_READ,
    badge: 'REAL',
  },
  {
    key: 'tenants',
    path: PLATFORM_ROUTES.TENANTS,
    title: 'Tenants',
    permission: PLATFORM_PERMISSIONS.TENANTS_READ,
    badge: 'REAL',
  },
  {
    key: 'security',
    path: PLATFORM_ROUTES.SECURITY,
    title: 'Security / SOC',
    permission: PLATFORM_PERMISSIONS.SECURITY_READ,
    badge: 'REAL',
  },
  {
    key: 'audit',
    path: PLATFORM_ROUTES.AUDIT,
    title: 'Global Audit',
    permission: PLATFORM_PERMISSIONS.AUDIT_READ,
    badge: 'REAL',
  },
  {
    key: 'staff',
    path: PLATFORM_ROUTES.STAFF,
    title: 'Platform Staff & RBAC',
    permission: PLATFORM_PERMISSIONS.STAFF_READ,
    badge: 'REAL',
  },
  {
    key: 'billing',
    path: PLATFORM_ROUTES.BILLING,
    title: 'Billing & Plans',
    permission: PLATFORM_PERMISSIONS.BILLING_READ,
    badge: 'PLANNED',
    unimplemented: true,
  },
  {
    key: 'support',
    path: PLATFORM_ROUTES.SUPPORT,
    title: 'Platform Support',
    permission: PLATFORM_PERMISSIONS.SUPPORT_READ,
    badge: 'PLANNED',
    unimplemented: true,
  },
  {
    key: 'features',
    path: PLATFORM_ROUTES.CONFIGURATION,
    title: 'Feature Management',
    permission: PLATFORM_PERMISSIONS.FEATURES_READ,
    badge: 'PLANNED',
    unimplemented: true,
  },
  {
    key: 'infrastructure',
    path: PLATFORM_ROUTES.INFRASTRUCTURE,
    title: 'Infrastructure & Ops',
    permission: PLATFORM_PERMISSIONS.INFRASTRUCTURE_READ,
    badge: 'PLANNED',
    unimplemented: true,
  },
  {
    key: 'analytics',
    path: PLATFORM_ROUTES.ANALYTICS,
    title: 'Platform Analytics',
    permission: PLATFORM_PERMISSIONS.ANALYTICS_READ,
    badge: 'PLANNED',
    unimplemented: true,
  },
];

export function getRouteTitle(pathname: string): string {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  const matched = PLATFORM_NAV_ROUTES.find((route) => route.path === normalized);
  if (matched) {
    return matched.title;
  }
  if (normalized === PLATFORM_ROUTES.ROOT) {
    return 'Dashboard';
  }
  if (normalized === PLATFORM_ROUTES.LOGIN) {
    return 'Platform Sign In';
  }
  if (normalized === PLATFORM_ROUTES.PRIVACY_POLICY) {
    return 'Privacy Policy & IT Act Notice';
  }
  return 'Page Not Found';
}

export function sanitizeReturnPath(candidate: unknown): string {
  if (typeof candidate !== 'string') {
    return PLATFORM_ROUTES.OVERVIEW;
  }
  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    return PLATFORM_ROUTES.OVERVIEW;
  }
  if (candidate === PLATFORM_ROUTES.LOGIN || candidate.startsWith(`${PLATFORM_ROUTES.LOGIN}?`)) {
    return PLATFORM_ROUTES.OVERVIEW;
  }
  return candidate;
}
