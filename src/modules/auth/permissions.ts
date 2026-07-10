// Central, scalable access catalogue.
//
// Access is modelled along two independent, extensible dimensions:
//   1. ROLES        — coarse buckets ('admin' | 'member'). Admin bypasses all checks.
//   2. PERMISSIONS  — fine-grained capability strings ('listings:read', ...).
//   3. SCOPES       — data-row filters (currently `cities`). New scope dimensions
//                     can be added later (e.g. `operators`, `teams`) without
//                     touching the permission machinery.
//
// To add a new capability later, append it to PERMISSIONS — nothing else hardcodes
// the list, so the model scales beyond city-based access.

export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  LISTINGS_READ: 'listings:read',
  LISTINGS_WRITE: 'listings:write',
  PROPOSALS_READ: 'proposals:read',
  PROPOSALS_WRITE: 'proposals:write',
  LEADS_READ: 'leads:read',
  LEADS_WRITE: 'leads:write',
  LEADS_ASSIGN: 'leads:assign',
  USERS_MANAGE: 'users:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// Sensible default capability set for a newly created member.
export const DEFAULT_MEMBER_PERMISSIONS: Permission[] = [
  PERMISSIONS.LISTINGS_READ,
  PERMISSIONS.PROPOSALS_READ,
  PERMISSIONS.PROPOSALS_WRITE,
  PERMISSIONS.LEADS_READ,
  PERMISSIONS.LEADS_WRITE,
];

export type AccessUser = {
  role: Role;
  permissions?: string[];
  cities?: string[];
};

// The authenticated principal attached to each request (req.user).
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  cities: string[];
}

export function isAdmin(user: AccessUser | undefined | null): boolean {
  return !!user && user.role === 'admin';
}

export function hasPermission(user: AccessUser | undefined | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.permissions || []).includes(permission);
}

// Returns the cities a member is scoped to, or `null` meaning "no restriction"
// (admins, or members explicitly granted all cities).
export function cityScope(user: AccessUser | undefined | null): string[] | null {
  if (!user || user.role === 'admin') return null;
  const cities = (user.cities || []).filter(Boolean);
  return cities.length ? cities : [];
}
