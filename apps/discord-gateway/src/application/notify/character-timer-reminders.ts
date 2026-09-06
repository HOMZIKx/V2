/** File-backed "Przypomnij później" queue — survives discord-gateway restart. */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type CharacterTimerReminderJob = {
  readonly key: string;
  readonly discordUserId: string;
  readonly timerId: string;
  readonly label: string;
  readonly characterName: string | null;
  readonly characterId: string | null;
  readonly fireAtMs: number;
};

export type CharacterTimerReminderDeps = {
  readonly send: (job: CharacterTimerReminderJob) => Promise<void>;
  readonly logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
};

type PersistShape = {
  readonly jobs: CharacterTimerReminderJob[];
};

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const metaByKey = new Map<string, CharacterTimerReminderJob>();
let sendDeps: CharacterTimerReminderDeps | null = null;
let loaded = false;

function dataDir(): string {
  const fromEnv = (process.env.DESTILED_DATA_DIR ?? '').trim();
  if (fromEnv) return fromEnv;
  // Repo-root .data (same family as generaly-metki) when cwd is apps/discord-gateway or monorepo root.
  const candidates = [
    join(process.cwd(), '.data', 'character-timer-reminders'),
    join(process.cwd(), '..', '..', '.data', 'character-timer-reminders'),
    join(process.cwd(), '..', '.data', 'character-timer-reminders'),
  ];
  for (const dir of candidates) {
    const parent = join(dir, '..');
    if (existsSync(parent) || existsSync(join(parent, 'generaly-metki'))) {
      return dir;
    }
  }
  return candidates[0]!;
}

function persistPath(): string {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'queue.json');
}

function saveToDisk(): void {
  try {
    const payload: PersistShape = { jobs: [...metaByKey.values()] };
    const target = persistPath();
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    renameSync(tmp, target);
  } catch {
    /* memory still works */
  }
}

function loadFromDisk(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed || !Array.isArray(parsed.jobs)) return;
    const now = Date.now();
    for (const job of parsed.jobs) {
      if (!job || typeof job.key !== 'string' || typeof job.fireAtMs !== 'number') continue;
      if (!job.discordUserId || !job.timerId) continue;
      // Drop ancient jobs (>48h overdue) — avoid surprise spam after long downtime.
      if (job.fireAtMs < now - 48 * 3_600_000) continue;
      metaByKey.set(job.key, {
        key: job.key,
        discordUserId: job.discordUserId,
        timerId: job.timerId,
        label: typeof job.label === 'string' ? job.label : job.timerId,
        characterName: job.characterName ?? null,
        characterId: job.characterId ?? null,
        fireAtMs: job.fireAtMs,
      });
    }
  } catch {
    /* fresh */
  }
}

function armTimeout(job: CharacterTimerReminderJob): void {
  const existing = pending.get(job.key);
  if (existing) {
    clearTimeout(existing);
    pending.delete(job.key);
  }
  const delayMs = Math.max(0, job.fireAtMs - Date.now());
  const handle = setTimeout(() => {
    pending.delete(job.key);
    metaByKey.delete(job.key);
    saveToDisk();
    const deps = sendDeps;
    if (!deps) return;
    void deps.send(job).catch((error: unknown) => {
      deps.logger.warn('Character timer reminder DM failed', {
        timerId: job.timerId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    });
  }, delayMs);
  if (typeof handle === 'object' && handle && 'unref' in handle) {
    handle.unref();
  }
  pending.set(job.key, handle);
}

/**
 * Wire send/logger once on gateway start, then reload + arm queue from disk.
 * Safe to call again (rebinds deps and re-arms).
 */
export function startCharacterTimerReminderWorker(deps: CharacterTimerReminderDeps): {
  readonly reloaded: number;
} {
  sendDeps = deps;
  loadFromDisk();
  let reloaded = 0;
  for (const job of metaByKey.values()) {
    armTimeout(job);
    reloaded += 1;
  }
  deps.logger.info('Character timer reminder worker ready', {
    reloaded,
    path: persistPath(),
  });
  return { reloaded };
}

export function scheduleCharacterTimerReminder(
  input: {
    readonly discordUserId: string;
    readonly timerId: string;
    readonly label: string;
    readonly characterName?: string | null;
    readonly characterId?: string | null;
    readonly delayMs: number;
  },
  deps: CharacterTimerReminderDeps,
): { readonly ok: true; readonly fireAtMs: number } | { readonly ok: false; readonly reason: string } {
  sendDeps = deps;
  loadFromDisk();
  const delayMs = Math.max(5_000, Math.min(24 * 3_600_000, Math.round(input.delayMs)));
  const key = `${input.discordUserId}:${input.timerId}`;
  const fireAtMs = Date.now() + delayMs;
  const job: CharacterTimerReminderJob = {
    key,
    discordUserId: input.discordUserId,
    timerId: input.timerId,
    label: input.label,
    characterName: input.characterName ?? null,
    characterId: input.characterId ?? null,
    fireAtMs,
  };
  metaByKey.set(key, job);
  saveToDisk();
  armTimeout(job);
  deps.logger.info('Character timer reminder scheduled', {
    timerId: job.timerId,
    delayMs,
    fireAtMs,
    durable: true,
  });
  return { ok: true, fireAtMs };
}

export function cancelCharacterTimerReminder(discordUserId: string, timerId: string): void {
  loadFromDisk();
  const key = `${discordUserId}:${timerId}`;
  const handle = pending.get(key);
  if (handle) clearTimeout(handle);
  pending.delete(key);
  metaByKey.delete(key);
  saveToDisk();
}

/** Test helper */
export function resetCharacterTimerRemindersForTests(): void {
  for (const handle of pending.values()) clearTimeout(handle);
  pending.clear();
  metaByKey.clear();
  loaded = false;
  sendDeps = null;
  try {
    writeFileSync(persistPath(), JSON.stringify({ jobs: [] }), 'utf8');
  } catch {
    /* ignore */
  }
}
