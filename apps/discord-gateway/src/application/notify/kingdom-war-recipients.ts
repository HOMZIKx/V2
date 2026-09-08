/**
 * Legacy global coordination-recipient registry.
 *
 * IMPORTANT: kingdom-war delivery is no longer allowed to read this global set.
 * Team-scoped war recipients live in kingdom-war-team-recipients.ts and are keyed
 * by workspaceId. We keep this file only for backward-compatible timer/team sync
 * endpoints while old web clients are still rolling out.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MAX_RECIPIENTS = 40;

const recipients = new Set<string>();
let loaded = false;

function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
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
  return join(base, 'recipients.json');
}

function loadFromDisk(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as { recipients?: unknown };
    if (!parsed || !Array.isArray(parsed.recipients)) return;
    recipients.clear();
    for (const rawId of parsed.recipients) {
      if (typeof rawId !== 'string') continue;
      const id = rawId.trim();
      if (!isSnowflake(id)) continue;
      recipients.add(id);
      if (recipients.size >= MAX_RECIPIENTS) break;
    }
  } catch {
    /* fresh */
  }
}

function saveToDisk(): void {
  try {
    const target = persistPath();
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ recipients: [...recipients] }), 'utf8');
    renameSync(tmp, target);
  } catch {
    /* memory still works */
  }
}

function addValidRecipients(discordUserIds: readonly string[]): void {
  for (const raw of discordUserIds) {
    const id = raw.trim();
    if (!isSnowflake(id)) continue;
    recipients.add(id);
    if (recipients.size >= MAX_RECIPIENTS) break;
  }
}

/** @deprecated Global war delivery is disabled. Kept only for old sync callers. */
export function replaceKingdomWarRecipients(discordUserIds: readonly string[]): {
  readonly ok: true;
  readonly count: number;
} {
  loadFromDisk();
  recipients.clear();
  addValidRecipients(discordUserIds);
  saveToDisk();
  return { ok: true, count: recipients.size };
}

/** @deprecated Kept only for old team-coordination sync callers. */
export function mergeTeamCoordinationRecipients(discordUserIds: readonly string[]): {
  readonly ok: true;
  readonly count: number;
} {
  loadFromDisk();
  addValidRecipients(discordUserIds);
  saveToDisk();
  return { ok: true, count: recipients.size };
}

/**
 * HARD SAFETY BOUNDARY: never expose the legacy global set to a sender.
 * Returning an empty list also makes old fallback paths actor-only instead of
 * accidentally mixing members from unrelated workspaces.
 */
export function listKingdomWarRecipients(): readonly string[] {
  return [];
}

/** Test helper */
export function clearKingdomWarRecipientsForTests(): void {
  recipients.clear();
  loaded = false;
  try {
    writeFileSync(persistPath(), JSON.stringify({ recipients: [] }), 'utf8');
  } catch {
    /* ignore */
  }
}
