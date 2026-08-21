import { readAdminSession } from '../auth/session.js';
import { classifyNetworkFailure } from './network-error.js';

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

  public get isForbidden(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }

  public get isValidation(): boolean {
    return this.status === 400 || this.code === 'VALIDATION_FAILED';
  }
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4400';
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Stable key for an in-flight mutation fingerprint — protects double-click / retry. */
const inFlightIdempotencyKeys = new Map<string, string>();

function idempotencyKeyForRequest(
  method: string,
  path: string,
  body: unknown | undefined,
): string {
  const fingerprint = `${method}:${path}:${body === undefined ? '' : JSON.stringify(body)}`;
  const existing = inFlightIdempotencyKeys.get(fingerprint);
  if (existing !== undefined) {
    return existing;
  }
  const key = newIdempotencyKey();
  inFlightIdempotencyKeys.set(fingerprint, key);
  return key;
}

function releaseIdempotencyKey(method: string, path: string, body: unknown | undefined): void {
  const fingerprint = `${method}:${path}:${body === undefined ? '' : JSON.stringify(body)}`;
  inFlightIdempotencyKeys.delete(fingerprint);
}

function parseErrorBody(body: unknown): {
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

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    idempotent?: boolean;
    query?: Record<string, string | number | boolean | undefined | null>;
  } = {},
): Promise<T> {
  const session = readAdminSession();
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-correlation-id': crypto.randomUUID(),
  };

  if (session.actorDiscordUserId !== null) {
    headers['X-Actor-Discord-User-Id'] = session.actorDiscordUserId;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.idempotent === true || method !== 'GET') {
    headers['Idempotency-Key'] = idempotencyKeyForRequest(method, path, options.body);
  }

  const url = new URL(path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`);
  if (options.query !== undefined) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'include',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    releaseIdempotencyKey(method, path, options.body);
    throw classifyNetworkFailure(error, url, method);
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
