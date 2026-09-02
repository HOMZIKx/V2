import { getApiBaseUrl, getIdentityPublicUrl } from './env';
import type {
  ActivityDto,
  GuildConfigDto,
  InboxItemDto,
  InboxListDto,
  ParticipationDto,
  SessionMeDto,
} from './types';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly fields: Readonly<Record<string, string>>;

  public constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      fields?: Readonly<Record<string, string>>;
    },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code ?? 'UNKNOWN';
    this.fields = options.fields ?? {};
  }

  public get isUnauthorized(): boolean {
    return this.status === 401 || this.code === 'UNAUTHORIZED';
  }

  public get isForbidden(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }

  public get isUnavailable(): boolean {
    return (
      this.status === 503 || this.code === 'SERVICE_UNAVAILABLE' || this.code === 'UNAVAILABLE'
    );
  }

  public get isNotFound(): boolean {
    return this.status === 404 || this.code === 'NOT_FOUND';
  }

  public get isConflict(): boolean {
    return this.status === 409 || this.code === 'CONFLICT' || this.code === 'CAPACITY_EXCEEDED';
  }
}

export function parseErrorBody(body: unknown): {
  message: string;
  code: string;
  fields: Record<string, string>;
} {
  if (typeof body !== 'object' || body === null) {
    return { message: 'Request failed', code: 'UNKNOWN', fields: {} };
  }
  const record = body as Record<string, unknown>;
  const errorNode =
    typeof record.error === 'object' && record.error !== null
      ? (record.error as Record<string, unknown>)
      : record;

  const message =
    typeof errorNode.message === 'string'
      ? errorNode.message
      : typeof record.message === 'string'
        ? record.message
        : 'Request failed';
  const code =
    typeof errorNode.code === 'string'
      ? errorNode.code
      : typeof record.code === 'string'
        ? record.code
        : 'UNKNOWN';

  const fields: Record<string, string> = {};
  const rawFields = errorNode.fields ?? record.fields ?? record.errors;
  if (typeof rawFields === 'object' && rawFields !== null && !Array.isArray(rawFields)) {
    for (const [key, value] of Object.entries(rawFields as Record<string, unknown>)) {
      if (typeof value === 'string') {
        fields[key] = value;
      } else if (Array.isArray(value) && typeof value[0] === 'string') {
        fields[key] = value[0];
      }
    }
  }

  return { message, code, fields };
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

export function buildApiUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  const url = new URL(path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function apiRequest<T>(
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

function asActivityArray(value: unknown): ActivityDto[] {
  if (Array.isArray(value)) {
    return value as ActivityDto[];
  }
  if (typeof value === 'object' && value !== null && 'items' in value) {
    const items = value.items;
    return Array.isArray(items) ? (items as ActivityDto[]) : [];
  }
  return [];
}

function asParticipantArray(value: unknown): ParticipationDto[] {
  if (Array.isArray(value)) {
    return value as ParticipationDto[];
  }
  if (typeof value === 'object' && value !== null && 'items' in value) {
    const items = value.items;
    return Array.isArray(items) ? (items as ParticipationDto[]) : [];
  }
  return [];
}

export async function getSessionMe(): Promise<SessionMeDto> {
  return apiRequest<SessionMeDto>('/session/me');
}

export async function logoutIdentity(): Promise<void> {
  const base = getIdentityPublicUrl().replace(/\/$/, '');
  const response = await fetch(`${base}/identity/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok && response.status !== 401) {
    const text = await response.text();
    let parsed: unknown = null;
    if (text !== '') {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { message: text };
      }
    }
    const err = parseErrorBody(parsed);
    throw new ApiClientError(err.message, {
      status: response.status,
      code: err.code,
      fields: err.fields,
    });
  }
}

export async function listActivities(
  guildId: string,
  signal?: AbortSignal,
): Promise<ActivityDto[]> {
  const raw = await apiRequest<unknown>('/activity/v1/activities', {
    query: { guildId },
    ...(signal !== undefined ? { signal } : {}),
  });
  return asActivityArray(raw);
}

export async function getActivity(id: string, signal?: AbortSignal): Promise<ActivityDto> {
  return apiRequest<ActivityDto>(`/activity/v1/activities/${encodeURIComponent(id)}`, {
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function listParticipants(
  id: string,
  signal?: AbortSignal,
): Promise<ParticipationDto[]> {
  const raw = await apiRequest<unknown>(
    `/activity/v1/activities/${encodeURIComponent(id)}/participants`,
    signal !== undefined ? { signal } : {},
  );
  return asParticipantArray(raw);
}

export async function getGuildConfig(
  guildId: string,
  signal?: AbortSignal,
): Promise<GuildConfigDto> {
  return apiRequest<GuildConfigDto>(`/activity/v1/guilds/${encodeURIComponent(guildId)}/config`, {
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function rsvp(id: string, statusDefId: string): Promise<unknown> {
  return apiRequest(`/activity/v1/activities/${encodeURIComponent(id)}/rsvp`, {
    method: 'POST',
    body: { statusDefId },
  });
}

export async function resign(id: string): Promise<unknown> {
  return apiRequest(`/activity/v1/activities/${encodeURIComponent(id)}/resign`, {
    method: 'POST',
    body: {},
  });
}

export async function reconfirm(id: string): Promise<unknown> {
  return apiRequest(`/activity/v1/activities/${encodeURIComponent(id)}/reconfirm`, {
    method: 'POST',
    body: {},
  });
}

export async function listMyActivities(
  guildId?: string,
  signal?: AbortSignal,
): Promise<ActivityDto[]> {
  const raw = await apiRequest<unknown>('/activity/v1/me/activities', {
    query: { guildId },
    ...(signal !== undefined ? { signal } : {}),
  });
  return asActivityArray(raw);
}

export async function getSelfStats(
  guildId: string,
  signal?: AbortSignal,
): Promise<{ present: number; absent: number; total: number }> {
  const raw = await apiRequest<{
    present?: number;
    absent?: number;
    total?: number;
  }>(`/activity/v1/guilds/${encodeURIComponent(guildId)}/stats/self`, {
    ...(signal !== undefined ? { signal } : {}),
  });
  return {
    present: typeof raw.present === 'number' ? raw.present : 0,
    absent: typeof raw.absent === 'number' ? raw.absent : 0,
    total: typeof raw.total === 'number' ? raw.total : 0,
  };
}

export async function listInbox(signal?: AbortSignal): Promise<InboxListDto> {
  const raw = await apiRequest<InboxListDto | { items?: InboxItemDto[] }>('/activity/v1/inbox', {
    ...(signal !== undefined ? { signal } : {}),
  });
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items,
    nextCursor: 'nextCursor' in raw && typeof raw.nextCursor === 'string' ? raw.nextCursor : null,
  };
}

export async function markInboxRead(id: string): Promise<InboxItemDto> {
  return apiRequest<InboxItemDto>(`/activity/v1/inbox/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    body: {},
  });
}
