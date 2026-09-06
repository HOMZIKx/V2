/** War character claims for the day — file-backed so restart keeps tonight's claims. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type ClaimMap = Record<string, string>; // characterId -> discordUserId

type PersistShape = {
  readonly dayKey: string;
  readonly claims: ClaimMap;
};

let claims: ClaimMap = {};
let claimDayKey = '';
let loaded = false;

function warsawDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function persistPath(): string {
  const dir = join(tmpdir(), 'destiled-kingdom-war');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'claims.json');
}

function loadFromDisk(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed && typeof parsed.dayKey === 'string' && parsed.claims && typeof parsed.claims === 'object') {
      claimDayKey = parsed.dayKey;
      claims = { ...parsed.claims };
    }
  } catch {
    /* fresh */
  }
}

function saveToDisk(): void {
  try {
    const payload: PersistShape = { dayKey: claimDayKey, claims: { ...claims } };
    writeFileSync(persistPath(), JSON.stringify(payload), 'utf8');
  } catch {
    /* memory still works */
  }
}

function ensureDay(): void {
  loadFromDisk();
  const key = warsawDayKey();
  if (key !== claimDayKey) {
    claimDayKey = key;
    claims = {};
    saveToDisk();
  }
}

export function getKingdomWarClaims(): ClaimMap {
  ensureDay();
  return { ...claims };
}

export function countClaimsForUser(discordUserId: string): number {
  ensureDay();
  let n = 0;
  for (const userId of Object.values(claims)) {
    if (userId === discordUserId) n += 1;
  }
  return n;
}

export function claimKingdomWarCharacter(input: {
  readonly characterId: string;
  readonly discordUserId: string;
  /** Max characters one Discord user may hold (Technika kingdomWar.maxClaimsPerUser). */
  readonly maxClaimsPerUser?: number;
}):
  | { readonly ok: true; readonly claims: ClaimMap }
  | { readonly ok: false; readonly reason: 'taken' | 'max_claims' } {
  ensureDay();
  const maxClaims = Math.max(1, Math.min(20, input.maxClaimsPerUser ?? 3));
  const existing = claims[input.characterId];
  if (existing && existing !== input.discordUserId) {
    return { ok: false, reason: 'taken' };
  }
  // Re-selecting own claim is idempotent and does not consume an extra slot.
  if (existing === input.discordUserId) {
    return { ok: true, claims: { ...claims } };
  }
  const owned = countClaimsForUser(input.discordUserId);
  if (owned >= maxClaims) {
    return { ok: false, reason: 'max_claims' };
  }
  claims = { ...claims, [input.characterId]: input.discordUserId };
  saveToDisk();
  return { ok: true, claims: { ...claims } };
}

export function resetKingdomWarClaimsForTests(): void {
  claims = {};
  claimDayKey = '';
  loaded = false;
  try {
    writeFileSync(persistPath(), JSON.stringify({ dayKey: '', claims: {} }), 'utf8');
  } catch {
    /* ignore */
  }
}
