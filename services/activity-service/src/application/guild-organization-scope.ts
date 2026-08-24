import { ActivityError } from '../domain/errors.js';
import type { ActivityTx } from './ports/activity.ports.js';

/**
 * Authoritative organization for normal runtime guild-scoped operations.
 * Client-supplied org must match guild_activity_settings.org_id; missing settings fail closed.
 */
export async function resolveGuildOrganizationId(
  tx: ActivityTx,
  guildId: string,
  requestedOrganizationId: string,
): Promise<string> {
  const settings = await tx.getSettings(guildId);
  if (settings === null) {
    throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
  }
  if (settings.orgId !== requestedOrganizationId) {
    throw new ActivityError('FORBIDDEN', 'Organization scope mismatch for guild');
  }
  return settings.orgId;
}

/**
 * First-time guild bootstrap (ensure-defaults / initial publish) may assign org when settings absent.
 * Do not use for routine reads or LFG mutations after bootstrap.
 */
export async function resolveGuildOrganizationIdForBootstrap(
  tx: ActivityTx,
  guildId: string,
  requestedOrganizationId: string,
): Promise<string> {
  const settings = await tx.getSettings(guildId);
  if (settings === null) {
    return requestedOrganizationId;
  }
  if (settings.orgId !== requestedOrganizationId) {
    throw new ActivityError('FORBIDDEN', 'Organization scope mismatch for guild');
  }
  return settings.orgId;
}

/** Strict check for admin org-scoped reads/writes (guild settings must exist). */
export async function requireGuildOrganizationMatch(
  tx: ActivityTx,
  guildId: string,
  organizationId: string,
): Promise<void> {
  const settings = await tx.getSettings(guildId);
  if (settings === null) {
    throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
  }
  if (settings.orgId !== organizationId) {
    throw new ActivityError('FORBIDDEN', 'Organization scope mismatch for guild');
  }
}
