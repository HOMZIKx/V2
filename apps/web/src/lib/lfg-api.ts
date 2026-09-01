import { ApiClientError, buildApiUrl, parseErrorBody } from './api';
import { getIdentityPublicUrl } from './env';

export type LfgPartyRoleKey = 'TANK' | 'BUFF' | 'DPS' | 'FLEX';

export interface LfgMatchDto {
  readonly activityId: string;
  readonly opaqueId?: string;
  readonly occupancy?: { readonly occupied: number; readonly capacity: number };
  readonly roleNeedSummary?: string;
  readonly matchReason?: string;
  readonly score?: number;
}

export interface LfgSearchResultDto {
  readonly matches: readonly LfgMatchDto[];
  readonly similarGroupsWarning?: string | null;
}

export interface LfgWatchDto {
  readonly id: string;
  readonly activityTypeKey?: string;
  readonly sessionRoles?: readonly string[];
  readonly windowStartAt?: string;
  readonly windowEndAt?: string;
  readonly expiresAt?: string;
  readonly pausedAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly fulfilledAt?: string | null;
  readonly characterId?: string;
  readonly classSpecKey?: string;
}

export interface LfgJoinResultDto {
  readonly joined?: boolean;
  readonly waitlistPosition?: number | null;
  readonly partyRoleKey?: string;
}

export interface IdentityProfileCharacterDto {
  readonly id: string;
  readonly nickname: string;
  readonly classSpecKey: string;
  readonly classSpecLabel?: string;
  readonly level?: number | null;
  readonly isDefault?: boolean;
  readonly gameAccountId?: string | null;
  readonly partyRoles: readonly LfgPartyRoleKey[];
}

export interface GameAccountDto {
  readonly id: string;
  readonly displayName: string;
  readonly description?: string | null;
  readonly displayOrder: number;
  readonly characterCount: number;
}

export interface IdentityProfileDto {
  readonly userId: string;
  readonly displayName?: string | null;
  readonly activeCharacterId?: string | null;
  readonly gameAccounts?: readonly GameAccountDto[];
  readonly characters: readonly IdentityProfileCharacterDto[];
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

const inFlightIdempotencyKeys = new Map<string, string>();

function idempotencyKeyForRequest(method: string, path: string, body?: unknown): string {
  const fingerprint = `${method}:${path}:${body === undefined ? '' : JSON.stringify(body)}`;
  const existing = inFlightIdempotencyKeys.get(fingerprint);
  if (existing !== undefined) {
    return existing;
  }
  const key = newIdempotencyKey();
  inFlightIdempotencyKeys.set(fingerprint, key);
  return key;
}

function releaseIdempotencyKey(method: string, path: string, body?: unknown): void {
  const fingerprint = `${method}:${path}:${body === undefined ? '' : JSON.stringify(body)}`;
  inFlightIdempotencyKeys.delete(fingerprint);
}

async function lfgRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    idempotent?: boolean;
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.idempotent === true || method !== 'GET') {
    headers['Idempotency-Key'] = idempotencyKeyForRequest(method, path, options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    releaseIdempotencyKey(method, path, options.body);
    throw error;
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  if (!response.ok) {
    releaseIdempotencyKey(method, path, options.body);
    const err = parseErrorBody(parsed);
    throw new ApiClientError(err.message, {
      status: response.status,
      code: err.code,
      fields: err.fields,
    });
  }

  releaseIdempotencyKey(method, path, options.body);
  return parsed as T;
}

function asWatchArray(value: unknown): LfgWatchDto[] {
  if (Array.isArray(value)) {
    return value as LfgWatchDto[];
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items as LfgWatchDto[];
    }
    if (Array.isArray(record.watches)) {
      return record.watches as LfgWatchDto[];
    }
  }
  return [];
}

function asMatchArray(value: unknown): LfgMatchDto[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const matches = (value as { matches?: unknown }).matches;
  return Array.isArray(matches) ? (matches as LfgMatchDto[]) : [];
}

export type UpsertIdentityCharacterPayload = {
  readonly nickname: string;
  readonly classSpecKey: string;
  readonly level?: number | null;
  readonly isDefault?: boolean;
  readonly gameAccountId?: string;
  readonly partyRoles: readonly LfgPartyRoleKey[];
};

async function identityProfileRequest<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const base = getIdentityPublicUrl().replace(/\/$/, '');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${base}${path}`, {
    method: options.method,
    credentials: 'include',
    headers,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }
  if (!response.ok) {
    const err = parseErrorBody(parsed);
    throw new ApiClientError(err.message, {
      status: response.status,
      code: err.code,
      fields: err.fields,
    });
  }
  return parsed as T;
}

function normalizeProfileResponse(parsed: unknown): IdentityProfileDto {
  if (typeof parsed !== 'object' || parsed === null || !('profile' in parsed)) {
    throw new ApiClientError('Invalid profile response', { status: 502, code: 'INVALID_RESPONSE' });
  }
  const profile = (parsed as { profile: IdentityProfileDto }).profile;
  return {
    ...profile,
    characters: Array.isArray(profile.characters) ? profile.characters : [],
    gameAccounts: Array.isArray(profile.gameAccounts) ? profile.gameAccounts : [],
  };
}

export async function getIdentityProfile(signal?: AbortSignal): Promise<IdentityProfileDto> {
  const parsed = await identityProfileRequest<unknown>('/identity/v1/profile', {
    method: 'GET',
    ...(signal !== undefined ? { signal } : {}),
  });
  return normalizeProfileResponse(parsed);
}

export async function createIdentityCharacter(
  body: UpsertIdentityCharacterPayload,
  signal?: AbortSignal,
): Promise<IdentityProfileDto> {
  const parsed = await identityProfileRequest<unknown>('/identity/v1/profile/characters', {
    method: 'POST',
    body,
    ...(signal !== undefined ? { signal } : {}),
  });
  return normalizeProfileResponse(parsed);
}

export async function updateIdentityCharacter(
  characterId: string,
  body: UpsertIdentityCharacterPayload,
  signal?: AbortSignal,
): Promise<IdentityProfileDto> {
  const parsed = await identityProfileRequest<unknown>(
    `/identity/v1/profile/characters/${encodeURIComponent(characterId)}`,
    {
      method: 'PUT',
      body,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return normalizeProfileResponse(parsed);
}

export async function listGameAccounts(signal?: AbortSignal): Promise<readonly GameAccountDto[]> {
  const parsed = await identityProfileRequest<{ accounts?: GameAccountDto[] }>(
    '/identity/v1/player/accounts',
    {
      method: 'GET',
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  return Array.isArray(parsed.accounts) ? parsed.accounts : [];
}

export async function createGameAccount(
  body: { displayName: string; description?: string | null },
  signal?: AbortSignal,
): Promise<GameAccountDto> {
  const parsed = await identityProfileRequest<{ account?: GameAccountDto }>(
    '/identity/v1/player/accounts',
    {
      method: 'POST',
      body,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  if (parsed.account === undefined) {
    throw new ApiClientError('Invalid account response', { status: 502, code: 'INVALID_RESPONSE' });
  }
  return parsed.account;
}

export async function updateGameAccount(
  accountId: string,
  body: { displayName?: string; description?: string | null; displayOrder?: number },
  signal?: AbortSignal,
): Promise<GameAccountDto> {
  const parsed = await identityProfileRequest<{ account?: GameAccountDto }>(
    `/identity/v1/player/accounts/${encodeURIComponent(accountId)}`,
    {
      method: 'PUT',
      body,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  if (parsed.account === undefined) {
    throw new ApiClientError('Invalid account response', { status: 502, code: 'INVALID_RESPONSE' });
  }
  return parsed.account;
}

export async function searchLfg(
  body: {
    guildId: string;
    organizationId: string;
    activityTypeKey: string;
    characterId: string;
    sessionRoles: readonly LfgPartyRoleKey[];
    windowStartAt: string;
    windowEndAt: string;
  },
  signal?: AbortSignal,
): Promise<LfgSearchResultDto> {
  const raw = await lfgRequest<unknown>('/activity/v1/lfg/search', {
    method: 'POST',
    body,
    ...(signal !== undefined ? { signal } : {}),
  });
  return {
    matches: asMatchArray(raw),
    similarGroupsWarning:
      typeof raw === 'object' &&
      raw !== null &&
      'similarGroupsWarning' in raw &&
      (typeof raw.similarGroupsWarning === 'string' || raw.similarGroupsWarning === null)
        ? ((raw as { similarGroupsWarning: string | null }).similarGroupsWarning ?? null)
        : null,
  };
}

export async function createLfgWatch(body: {
  guildId: string;
  organizationId: string;
  characterId: string;
  activityTypeKey: string;
  sessionRoles: readonly LfgPartyRoleKey[];
  windowStartAt: string;
  windowEndAt: string;
  classSpecKey?: string;
}): Promise<{ intentId?: string; id?: string }> {
  return lfgRequest('/activity/v1/lfg/watches', { method: 'POST', body, idempotent: true });
}

export async function listLfgWatches(
  guildId: string,
  signal?: AbortSignal,
): Promise<LfgWatchDto[]> {
  const raw = await lfgRequest<unknown>('/activity/v1/lfg/watches', {
    query: { guildId },
    ...(signal !== undefined ? { signal } : {}),
  });
  return asWatchArray(raw);
}

export async function cancelLfgWatch(watchId: string, guildId: string): Promise<unknown> {
  return lfgRequest(`/activity/v1/lfg/watches/${encodeURIComponent(watchId)}/cancel`, {
    method: 'POST',
    body: {},
    query: { guildId },
    idempotent: true,
  });
}

export async function pauseLfgWatch(watchId: string, guildId: string): Promise<unknown> {
  return lfgRequest(`/activity/v1/lfg/watches/${encodeURIComponent(watchId)}/pause`, {
    method: 'POST',
    body: {},
    query: { guildId },
    idempotent: true,
  });
}

export async function resumeLfgWatch(watchId: string, guildId: string): Promise<unknown> {
  return lfgRequest(`/activity/v1/lfg/watches/${encodeURIComponent(watchId)}/resume`, {
    method: 'POST',
    body: {},
    query: { guildId },
    idempotent: true,
  });
}

export async function updateLfgWatch(
  watchId: string,
  body: {
    guildId: string;
    sessionRoles: readonly LfgPartyRoleKey[];
    windowStartAt: string;
    windowEndAt: string;
    classSpecKey?: string;
  },
): Promise<unknown> {
  return lfgRequest(`/activity/v1/lfg/watches/${encodeURIComponent(watchId)}`, {
    method: 'PATCH',
    body,
    idempotent: true,
  });
}

export async function joinLfg(body: {
  activityId: string;
  statusDefId: string;
  partyRoleKey: LfgPartyRoleKey;
  guildId?: string;
  intentId?: string;
  characterId?: string;
}): Promise<LfgJoinResultDto> {
  return lfgRequest('/activity/v1/lfg/join', { method: 'POST', body, idempotent: true });
}

export async function suppressLfgMatch(
  activityId: string,
  body: { intentId: string; guildId: string },
): Promise<unknown> {
  return lfgRequest(`/activity/v1/lfg/matches/${encodeURIComponent(activityId)}/suppress`, {
    method: 'POST',
    body,
    idempotent: true,
  });
}
