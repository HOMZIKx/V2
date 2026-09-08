/** War character claims for the day — isolated per team/workspace and file-backed. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { kingdomWarWorkspaceScopeToken } from './kingdom-war-team-recipients.js';

type ClaimMap = Record<string, string>; // compactCharacterKey -> discordUserId

type PersistShapeV2 = {
  readonly version: 2;
  readonly dayKey: string;
  readonly scopes: Readonly<Record<string, ClaimMap>>;
};

type RecentScopeHint = { readonly scopeToken: string; readonly expiresAtMs: number };

let claimsByScope: Record<string, ClaimMap> = {};
let claimDayKey = '';
let loaded = false;
const recentScopeByUser = new Map<string, RecentScopeHint>();

function warsawDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function compactCharacterKey(characterId: string): string {
  return createHash('sha256').update(characterId).digest('base64url').slice(0, 16);
}

/** Compact signed-button payload identity; deterministic and safely below Discord's custom_id limit. */
export function encodeKingdomWarScopedCharacterId(
  workspaceId: string,
  characterId: string,
): string {
  return `${kingdomWarWorkspaceScopeToken(workspaceId)}.${compactCharacterKey(characterId)}`;
}

function parseScopedCharacterId(value: string): { scopeToken: string; characterKey: string } | null {
  const match = /^([A-Za-z0-9_-]{10})\.([A-Za-z0-9_-]{16})$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  return { scopeToken: match[1], characterKey: match[2] };
}

function persistPath(): string {
  const gatewayData = (process.env.DISCORD_GATEWAY_DATA_DIR ?? '').trim();
  const legacyData = (process.env.DESTILED_DATA_DIR ?? '').trim();
  const dir = gatewayData
    ? join(gatewayData, 'kingdom-war')
    : legacyData
      ? join(legacyData, 'kingdom-war')
      : join(tmpdir(), 'destiled-kingdom-war');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'claims-v2.json');
}

function loadFromDisk(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistShapeV2> & { claims?: unknown };
    // Never migrate the old global claims map into a team; ambiguous ownership must be dropped.
    if (
      parsed.version !== 2 ||
      typeof parsed.dayKey !== 'string' ||
      !parsed.scopes ||
      typeof parsed.scopes !== 'object'
    ) {
      return;
    }
    claimDayKey = parsed.dayKey;
    claimsByScope = {};
    for (const [scopeToken, rawClaims] of Object.entries(parsed.scopes)) {
      if (!/^[A-Za-z0-9_-]{10}$/.test(scopeToken) || !rawClaims || typeof rawClaims !== 'object') continue;
      const clean: ClaimMap = {};
      for (const [characterKey, discordUserId] of Object.entries(rawClaims)) {
        if (!/^[A-Za-z0-9_-]{16}$/.test(characterKey)) continue;
        if (typeof discordUserId !== 'string' || !/^\d{17,20}$/.test(discordUserId)) continue;
        clean[characterKey] = discordUserId;
      }
      claimsByScope[scopeToken] = clean;
    }
  } catch {
    /* fresh */
  }
}

function saveToDisk(): void {
  try {
    const payload: PersistShapeV2 = {
      version: 2,
      dayKey: claimDayKey,
      scopes: claimsByScope,
    };
    const target = persistPath();
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    renameSync(tmp, target);
  } catch {
    /* memory still works */
  }
}

function ensureDay(): void {
  loadFromDisk();
  const key = warsawDayKey();
  if (key !== claimDayKey) {
    claimDayKey = key;
    claimsByScope = {};
    recentScopeByUser.clear();
    saveToDisk();
  }
}

function flattenClaims(scopeToken?: string): ClaimMap {
  const flattened: ClaimMap = {};
  for (const [token, claims] of Object.entries(claimsByScope)) {
    if (scopeToken && token !== scopeToken) continue;
    for (const [characterKey, userId] of Object.entries(claims)) {
      flattened[`${token}.${characterKey}`] = userId;
    }
  }
  return flattened;
}

/** Returns scoped-key claims. With workspaceId omitted, returns all scopes without collisions. */
export function getKingdomWarClaims(workspaceId?: string): ClaimMap {
  ensureDay();
  return flattenClaims(workspaceId ? kingdomWarWorkspaceScopeToken(workspaceId) : undefined);
}

export function countClaimsForUser(discordUserId: string, workspaceId?: string): number {
  ensureDay();
  const scopeToken = workspaceId ? kingdomWarWorkspaceScopeToken(workspaceId) : null;
  let n = 0;
  for (const [token, claims] of Object.entries(claimsByScope)) {
    if (scopeToken && token !== scopeToken) continue;
    for (const userId of Object.values(claims)) {
      if (userId === discordUserId) n += 1;
    }
  }
  return n;
}

export function claimKingdomWarCharacter(input: {
  /** Must be the compact team-scoped id produced by encodeKingdomWarScopedCharacterId. */
  readonly characterId: string;
  readonly discordUserId: string;
  /** Max characters one Discord user may hold in this team. */
  readonly maxClaimsPerUser?: number;
}):
  | { readonly ok: true; readonly claims: ClaimMap }
  | { readonly ok: false; readonly reason: 'taken' | 'max_claims' } {
  ensureDay();
  const parsed = parseScopedCharacterId(input.characterId);
  // Old/global panels are intentionally non-actionable after the team-scope migration.
  if (!parsed) return { ok: false, reason: 'taken' };

  const maxClaims = Math.max(1, Math.min(20, input.maxClaimsPerUser ?? 3));
  const scopeClaims = { ...(claimsByScope[parsed.scopeToken] ?? {}) };
  const existing = scopeClaims[parsed.characterKey];
  if (existing && existing !== input.discordUserId) {
    return { ok: false, reason: 'taken' };
  }
  if (existing === input.discordUserId) {
    recentScopeByUser.set(input.discordUserId, {
      scopeToken: parsed.scopeToken,
      expiresAtMs: Date.now() + 30_000,
    });
    return { ok: true, claims: flattenClaims(parsed.scopeToken) };
  }

  let owned = 0;
  for (const userId of Object.values(scopeClaims)) {
    if (userId === input.discordUserId) owned += 1;
  }
  if (owned >= maxClaims) {
    return { ok: false, reason: 'max_claims' };
  }

  scopeClaims[parsed.characterKey] = input.discordUserId;
  claimsByScope = { ...claimsByScope, [parsed.scopeToken]: scopeClaims };
  recentScopeByUser.set(input.discordUserId, {
    scopeToken: parsed.scopeToken,
    expiresAtMs: Date.now() + 30_000,
  });
  saveToDisk();
  return { ok: true, claims: flattenClaims(parsed.scopeToken) };
}

/** One-shot hint used by the existing interaction router to resolve the exact team panel clicked. */
export function consumeKingdomWarScopeTokenForUser(discordUserId: string): string | null {
  const hint = recentScopeByUser.get(discordUserId);
  recentScopeByUser.delete(discordUserId);
  if (!hint || hint.expiresAtMs < Date.now()) return null;
  return hint.scopeToken;
}

export function resetKingdomWarClaimsForTests(): void {
  claimsByScope = {};
  claimDayKey = '';
  loaded = false;
  recentScopeByUser.clear();
  try {
    writeFileSync(
      persistPath(),
      JSON.stringify({ version: 2, dayKey: '', scopes: {} } satisfies PersistShapeV2),
      'utf8',
    );
  } catch {
    /* ignore */
  }
}
