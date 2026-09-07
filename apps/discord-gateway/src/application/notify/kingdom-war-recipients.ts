/**
 * Discord user IDs eligible for kingdom-war DMs (team notifyPrefs.kingdomWar).
 * File-backed so restart keeps tonight's allowlist.
 * HARD RULE: war scheduler DMs ONLY this list — never guild.members / never whole guild.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_RECIPIENTS = 40;

const recipients = new Set<string>();
let loaded = false;

function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

function persistPath(): string {
  const fromEnv = (process.env.DESTILED_DATA_DIR ?? '').trim();
  const base = fromEnv ? join(fromEnv, 'kingdom-war') : join(tmpdir(), 'destiled-kingdom-war');
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
    const tmp = target + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify({ recipients: [...recipients] }), 'utf8');
    renameSync(tmp, target);
  } catch {
    /* memory still works */
  }
}

export function replaceKingdomWarRecipients(discordUserIds: readonly string[]): {
  readonly ok: true;
  readonly count: number;
} {
  loadFromDisk();
  recipients.clear();
  for (const raw of discordUserIds) {
    const id = raw.trim();
    if (!isSnowflake(id)) continue;
    recipients.add(id);
    if (recipients.size >= MAX_RECIPIENTS) break;
  }
  saveToDisk();
  return { ok: true, count: recipients.size };
}

export function listKingdomWarRecipients(): readonly string[] {
  loadFromDisk();
  return [...recipients];
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
