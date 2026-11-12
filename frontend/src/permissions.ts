import type { User } from './types.js';

/**
 * Front-end mirror of the server's permission model. This only decides what to SHOW;
 * the server enforces every rule again, so hiding a button is never the security boundary.
 * Permissions come from the server (login and /auth/me) already merged with per-user overrides.
 */
export function can(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  const perms = user.permissions || [];
  return perms.includes(permission);
}

export function canAny(user: User | null | undefined, permissions: string[]): boolean {
  return permissions.some((p) => can(user, p));
}
