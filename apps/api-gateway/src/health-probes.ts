export const UPSTREAM_PROBE_TIMEOUT_MS = 2_000;

export type UpstreamReadyState = 'ok' | 'disabled' | 'not_configured' | 'unhealthy';
export type DiscordRuntimeState = 'ready' | 'disconnected' | 'unknown' | 'disabled';

export type DiscordRuntimeSnapshot = {
  readonly state: DiscordRuntimeState;
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
  if (baseUrl === null || baseUrl.trim() === '') {
    return 'not_configured';
  }

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/health/ready`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return 'unhealthy';
    }
    const parsed = await response.json().catch(() => null);
    if (parsed === null) {
      return 'unhealthy';
    }
    return parseReadyBody(parsed).disabled ? 'disabled' : 'ok';
  } catch {
    return 'unhealthy';
  }
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
