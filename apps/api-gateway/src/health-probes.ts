export const UPSTREAM_PROBE_TIMEOUT_MS = 2_000;

export type UpstreamReadyState = 'ok' | 'disabled' | 'not_configured' | 'unhealthy';
export type DiscordRuntimeState = 'ready' | 'disconnected' | 'unknown' | 'disabled';

export type OutboxReadySnapshot = {
  readonly pending: number;
  readonly claimed: number;
  readonly failed: number;
  readonly delivered: number;
  readonly retrying: number;
  readonly state: string;
  readonly oldestPendingAgeSeconds?: number | null;
  readonly lastErrorCategory?: string | null;
};

export type DiscordRuntimeSnapshot = {
  readonly state: DiscordRuntimeState;
};

export type UpstreamReadyProbe = {
  readonly state: UpstreamReadyState;
  readonly body: Record<string, unknown> | null;
};

type FetchLike = typeof fetch;

function parseReadyBody(body: unknown): { disabled: boolean } {
  if (typeof body !== 'object' || body === null) {
    return { disabled: false };
  }
  const record = body as Record<string, unknown>;
  return {
    disabled: record.authDisabled === true || record.activityDisabled === true,
  };
}

export async function probeUpstreamReady(
  baseUrl: string | null,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = UPSTREAM_PROBE_TIMEOUT_MS,
): Promise<UpstreamReadyState> {
  const probe = await probeUpstreamReadyBody(baseUrl, fetchImpl, timeoutMs);
  return probe.state;
}

export async function probeUpstreamReadyBody(
  baseUrl: string | null,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = UPSTREAM_PROBE_TIMEOUT_MS,
): Promise<UpstreamReadyProbe> {
  if (baseUrl === null || baseUrl.trim() === '') {
    return { state: 'not_configured', body: null };
  }

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/health/ready`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { state: 'unhealthy', body: null };
    }
    const parsed = await response.json().catch(() => null);
    if (parsed === null || typeof parsed !== 'object') {
      return { state: 'unhealthy', body: null };
    }
    const body = parsed as Record<string, unknown>;
    return {
      state: parseReadyBody(body).disabled ? 'disabled' : 'ok',
      body,
    };
  } catch {
    return { state: 'unhealthy', body: null };
  }
}

export function readOutboxReadySnapshot(
  body: Record<string, unknown> | null,
): OutboxReadySnapshot | undefined {
  if (body === null) {
    return undefined;
  }
  const outbox = body.outbox;
  if (typeof outbox !== 'object' || outbox === null) {
    return undefined;
  }
  const record = outbox as Record<string, unknown>;
  if (typeof record.state !== 'string') {
    return undefined;
  }
  return {
    pending: Number(record.pending ?? 0),
    claimed: Number(record.claimed ?? 0),
    failed: Number(record.failed ?? 0),
    delivered: Number(record.delivered ?? 0),
    retrying: Number(record.retrying ?? 0),
    state: record.state,
    oldestPendingAgeSeconds:
      record.oldestPendingAgeSeconds === null || record.oldestPendingAgeSeconds === undefined
        ? null
        : Number(record.oldestPendingAgeSeconds),
    lastErrorCategory:
      typeof record.lastErrorCategory === 'string' ? record.lastErrorCategory : null,
  };
}

export async function probeDiscordRuntime(
  baseUrl: string | null,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = UPSTREAM_PROBE_TIMEOUT_MS,
): Promise<DiscordRuntimeSnapshot> {
  if (baseUrl === null || baseUrl.trim() === '') {
    return { state: 'unknown' };
  }

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/health/ready`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = await response.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { state: response.ok ? 'unknown' : 'disconnected' };
    }
    const record = parsed as Record<string, unknown>;
    if (record.discordEnabled === false || record.discordState === 'disabled') {
      return { state: 'disabled' };
    }
    if (response.ok && record.discordState === 'ready') {
      return { state: 'ready' };
    }
    if (!response.ok) {
      return { state: 'disconnected' };
    }
    return { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}

export function isGatewayReady(
  activity: UpstreamReadyState,
  identity: UpstreamReadyState,
): boolean {
  return activity !== 'unhealthy' && identity !== 'unhealthy';
}
