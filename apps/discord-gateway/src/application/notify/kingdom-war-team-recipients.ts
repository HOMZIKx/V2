/**
 * Team-scoped kingdom-war DM recipient registry.
 *
 * Delivery identity is workspaceId. A recipient in team A never becomes eligible
 * for team B unless team B independently contains that Discord account and syncs it.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MAX_RECIPIENTS_PER_WORKSPACE = 40;
const MAX_WORKSPACES = 100;
const PERSIST_VERSION = 2 as const;

export type TeamKingdomWarRecipientScope = {
  readonly workspaceId: string;
  readonly scopeToken: string;
  readonly recipients: readonly string[];
};

type PersistShapeV2 = {
  readonly version: 2;
  readonly workspaces: Readonly<Record<string, readonly string[]>>;
};

const recipientsByWorkspace = new Map<string, Set<string>>();
let loaded = false;

function isSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

function normalizeWorkspaceId(value: string): string | null {
  const id = value.trim();
  if (id.length < 1 || id.length > 96) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) return null;
  return id;
}

export function kingdomWarWorkspaceScopeToken(workspaceId: string): string {
  return createHash('sha256').update(workspaceId).digest('base64url').slice(0, 10);
}

function persistPath(): string {
  const gatewayData = (process.env.DISCORD_GATEWAY_DATA_DIR ?? '').trim();
  const legacyData = (process.env.DESTILED_DATA_DIR ?? '').trim();
  const base = gatewayData
    ? join(gatewayData, 'kingdom-war')
    : legacyData
      ? join(legacyData, 'kingdom-war')
      : join(tmpdir(), 'destiled-kingdom-war');
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  return join(base, 'team-recipients-v2.json');
}

function loadFromDisk(): void {
  if (loaded) return;
  loaded = true;
  recipientsByWorkspace.clear();
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistShapeV2> & { recipients?: unknown };

    // Never migrate the old global { recipients: [...] } shape into one team.
    // That would recreate the exact cross-team leak this registry is meant to prevent.
    if (parsed.version !== PERSIST_VERSION || !parsed.workspaces || typeof parsed.workspaces !== 'object') {
      return;
    }

    for (const [rawWorkspaceId, rawRecipients] of Object.entries(parsed.workspaces)) {
      if (recipientsByWorkspace.size >= MAX_WORKSPACES) break;
      const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
      if (!workspaceId || !Array.isArray(rawRecipients)) continue;
      const set = new Set<string>();
      for (const rawId of rawRecipients) {
        if (typeof rawId !== 'string') continue;
        const id = rawId.trim();
        if (!isSnowflake(id)) continue;
        set.add(id);
        if (set.size >= MAX_RECIPIENTS_PER_WORKSPACE) break;
      }
      recipientsByWorkspace.set(workspaceId, set);
    }
  } catch {
    /* fresh */
  }
}

function saveToDisk(): void {
  try {
    const workspaces: Record<string, readonly string[]> = {};
    for (const [workspaceId, recipients] of recipientsByWorkspace) {
      workspaces[workspaceId] = [...recipients];
    }
    const payload: PersistShapeV2 = { version: PERSIST_VERSION, workspaces };
    const target = persistPath();
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    renameSync(tmp, target);
  } catch {
    /* memory still works */
  }
}

export function replaceTeamKingdomWarRecipients(
  workspaceIdRaw: string,
  discordUserIds: readonly string[],
): { readonly ok: true; readonly count: number } | { readonly ok: false; readonly reason: 'invalid_workspace' | 'workspace_limit' } {
  loadFromDisk();
  const workspaceId = normalizeWorkspaceId(workspaceIdRaw);
  if (!workspaceId) return { ok: false, reason: 'invalid_workspace' };
  if (!recipientsByWorkspace.has(workspaceId) && recipientsByWorkspace.size >= MAX_WORKSPACES) {
    return { ok: false, reason: 'workspace_limit' };
  }

  const next = new Set<string>();
  for (const raw of discordUserIds) {
    const id = raw.trim();
    if (!isSnowflake(id)) continue;
    next.add(id);
    if (next.size >= MAX_RECIPIENTS_PER_WORKSPACE) break;
  }
  // Keep empty scopes persisted: old already-sent signed buttons can still resolve
  // their team safely, while the scheduler naturally skips zero-recipient scopes.
  recipientsByWorkspace.set(workspaceId, next);
  saveToDisk();
  return { ok: true, count: next.size };
}

export function listTeamKingdomWarRecipientScopes(): readonly TeamKingdomWarRecipientScope[] {
  loadFromDisk();
  const result: TeamKingdomWarRecipientScope[] = [];
  for (const [workspaceId, recipients] of recipientsByWorkspace) {
    if (recipients.size === 0) continue;
    result.push({
      workspaceId,
      scopeToken: kingdomWarWorkspaceScopeToken(workspaceId),
      recipients: [...recipients],
    });
  }
  return result;
}

export function resolveTeamKingdomWarWorkspaceId(scopeToken: string): string | null {
  loadFromDisk();
  for (const workspaceId of recipientsByWorkspace.keys()) {
    if (kingdomWarWorkspaceScopeToken(workspaceId) === scopeToken) return workspaceId;
  }
  return null;
}

/** Test helper */
export function resetTeamKingdomWarRecipientsForTests(): void {
  recipientsByWorkspace.clear();
  loaded = false;
  try {
    writeFileSync(
      persistPath(),
      JSON.stringify({ version: PERSIST_VERSION, workspaces: {} } satisfies PersistShapeV2),
      'utf8',
    );
  } catch {
    /* ignore */
  }
}
