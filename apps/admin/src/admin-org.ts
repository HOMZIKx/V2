import { readAdminSession } from './auth/session.js';

/** Resolve organization id for Activity publish / LFG admin APIs. */
export function resolveAdminOrgId(): string | null {
  const session = readAdminSession();
  if (session.orgId !== null && session.orgId.trim() !== '') {
    return session.orgId.trim();
  }
  for (const key of ['VITE_ADMIN_ORG_ID', 'VITE_ADMIN_DEV_ORG_ID'] as const) {
    const raw: unknown = import.meta.env[key];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.trim();
    }
  }
  return null;
}
