import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = 1 as const;

type WarPanelMessage = {
  readonly workspaceId: string;
  readonly discordUserId: string;
  readonly dayKey: string;
  readonly messageId: string;
};

type PersistShape = {
  readonly version: 1;
  readonly dayKey: string;
  readonly selections: Record<string, Record<string, string>>;
  readonly panels: Record<string, WarPanelMessage>;
};

let loaded = false;
let currentDayKey = '';
let selections: Record<string, Record<string, string>> = {};
const panels = new Map<string, WarPanelMessage>();

function warsawDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function persistPath(): string {
  const configured = (process.env.DISCORD_GATEWAY_DATA_DIR ?? '').trim();
  const legacy = (process.env.DESTILED_DATA_DIR ?? '').trim();
  const dir = configured
    ? join(configured, 'kingdom-war')
    : legacy
      ? join(legacy, 'kingdom-war')
      : join(tmpdir(), 'destiled-kingdom-war');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'panels-v1.json');
}

function panelKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`;
}

function save(): void {
  try {
    const panelObject: Record<string, WarPanelMessage> = {};
    for (const [key, panel] of panels) panelObject[key] = panel;
    const payload: PersistShape = {
      version: VERSION,
      dayKey: currentDayKey,
      selections,
      panels: panelObject,
    };
    const target = persistPath();
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    renameSync(tmp, target);
  } catch {
    // memory stays usable
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    if (parsed.version !== VERSION) return;
    currentDayKey = typeof parsed.dayKey === 'string' ? parsed.dayKey : '';
    selections = parsed.selections && typeof parsed.selections === 'object' ? parsed.selections : {};
    if (parsed.panels && typeof parsed.panels === 'object') {
      for (const [key, panel] of Object.entries(parsed.panels)) {
        if (!panel || typeof panel.messageId !== 'string') continue;
        panels.set(key, panel);
      }
    }
  } catch {
    // fresh
  }
}

function ensureDay(now = new Date()): string {
  load();
  const dayKey = warsawDayKey(now);
  if (currentDayKey !== dayKey) {
    currentDayKey = dayKey;
    selections = {};
    panels.clear();
    save();
  }
  return dayKey;
}

export function getKingdomWarPanelSelections(workspaceId: string): Readonly<Record<string, string>> {
  ensureDay();
  return { ...(selections[workspaceId] ?? {}) };
}

export function replaceKingdomWarPanelSelectionForUser(input: {
  readonly workspaceId: string;
  readonly discordUserId: string;
  readonly characterIds: readonly string[];
  readonly maxClaims: number;
}): { readonly ok: true; readonly selections: Readonly<Record<string, string>> } | { readonly ok: false; readonly reason: 'taken' | 'max_claims' } {
  ensureDay();
  const maxClaims = Math.max(1, Math.min(20, Math.round(input.maxClaims || 3)));
  const requested = [...new Set(input.characterIds.map((id) => id.trim()).filter(Boolean))];
  if (requested.length > maxClaims) return { ok: false, reason: 'max_claims' };

  const current = { ...(selections[input.workspaceId] ?? {}) };
  for (const characterId of requested) {
    const owner = current[characterId];
    if (owner && owner !== input.discordUserId) return { ok: false, reason: 'taken' };
  }
  for (const [characterId, owner] of Object.entries(current)) {
    if (owner === input.discordUserId) delete current[characterId];
  }
  for (const characterId of requested) current[characterId] = input.discordUserId;
  selections = { ...selections, [input.workspaceId]: current };
  save();
  return { ok: true, selections: current };
}

export function getKingdomWarPanelMessage(workspaceId: string, discordUserId: string): WarPanelMessage | null {
  ensureDay();
  return panels.get(panelKey(workspaceId, discordUserId)) ?? null;
}

export function saveKingdomWarPanelMessage(message: WarPanelMessage): void {
  ensureDay();
  panels.set(panelKey(message.workspaceId, message.discordUserId), message);
  save();
}

export function currentKingdomWarPanelDayKey(): string {
  return ensureDay();
}

export function resetKingdomWarPanelRegistryForTests(): void {
  loaded = true;
  currentDayKey = warsawDayKey();
  selections = {};
  panels.clear();
  save();
}
