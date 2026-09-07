/**
 * New Bot (discord-gateway) health client for Technik Status / Diagnostyka.
 * Prefers same-origin /discord-gateway rewrite; optional NEXT_PUBLIC_DISCORD_GATEWAY_BASE_URL.
 */

export const DEFAULT_DISCORD_GATEWAY_BASE_URL = '/discord-gateway';

export type LiveHealth = {
  readonly status: string;
};

export type ReadyHealth = {
  readonly status: string;
  readonly discordEnabled?: boolean;
  readonly discordState?: string;
  readonly isolationOk?: boolean;
};

export type DiscordHealth = {
  readonly enabled: boolean;
  readonly state: string;
  readonly guildId: string;
  readonly pingMs: number | null;
  readonly uptimeSeconds: number;
  readonly commandsRegistered: boolean;
  readonly isolationOk: boolean;
  readonly lastError: string | null;
  readonly gitCommitSha: string;
  readonly panelRenderer: string;
};

export type HealthFetchOk<T> = {
  readonly ok: true;
  readonly data: T;
  readonly httpStatus: number;
};

export type HealthFetchErr = {
  readonly ok: false;
  readonly error: string;
  readonly kind: 'network' | 'http' | 'parse';
  readonly httpStatus?: number;
  readonly body?: unknown;
  readonly curlTip: string;
};

export type HealthFetchResult<T> = HealthFetchOk<T> | HealthFetchErr;

export function resolveDiscordGatewayBaseUrl(
  envValue: string | undefined = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_DISCORD_GATEWAY_BASE_URL
    : undefined,
): string {
  const trimmed = envValue?.trim();
  if (!trimmed) {
    return DEFAULT_DISCORD_GATEWAY_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

export function curlTipFor(path: string, baseUrl = resolveDiscordGatewayBaseUrl()): string {
  const absolute = baseUrl.startsWith('http')
    ? baseUrl
    : typeof window !== 'undefined'
      ? `${window.location.origin}${baseUrl}`
      : `http://127.0.0.1:3000${baseUrl}`;
  return `curl -sS "${absolute}${path}"`;
}

function networkErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const looksLikeCorsOrNetwork =
    /failed to fetch|networkerror|load failed|cors|blocked/i.test(raw) || raw === '';

  if (looksLikeCorsOrNetwork) {
    return (
      'Nie udało się pobrać zdrowia z przeglądarki (sieć/CORS). ' +
      'New Bot musi nasłuchiwać; lokalnie użyj proxy /discord-gateway lub curl.'
    );
  }

  return `Nie udało się pobrać zdrowia: ${raw}`;
}

export async function fetchJsonHealth<T>(
  path: string,
  baseUrl = resolveDiscordGatewayBaseUrl(),
  fetchImpl: typeof fetch = fetch,
): Promise<HealthFetchResult<T>> {
  const url = `${baseUrl}${path}`;
  const tip = curlTipFor(path, baseUrl);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        kind: 'parse',
        httpStatus: response.status,
        error: `Odpowiedź ${response.status} nie jest poprawnym JSON z ${url}.`,
        curlTip: tip,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        kind: 'http',
        httpStatus: response.status,
        body: data,
        error: `New Bot zwrócił HTTP ${response.status} dla ${path}.`,
        curlTip: tip,
      };
    }

    return {
      ok: true,
      data: data as T,
      httpStatus: response.status,
    };
  } catch (err) {
    return {
      ok: false,
      kind: 'network',
      error: networkErrorMessage(err),
      curlTip: tip,
    };
  }
}

export function fetchLiveHealth(
  baseUrl?: string,
  fetchImpl?: typeof fetch,
): Promise<HealthFetchResult<LiveHealth>> {
  return fetchJsonHealth<LiveHealth>(
    '/health/live',
    baseUrl ?? resolveDiscordGatewayBaseUrl(),
    fetchImpl,
  );
}

export function fetchReadyHealth(
  baseUrl?: string,
  fetchImpl?: typeof fetch,
): Promise<HealthFetchResult<ReadyHealth>> {
  return fetchJsonHealth<ReadyHealth>(
    '/health/ready',
    baseUrl ?? resolveDiscordGatewayBaseUrl(),
    fetchImpl,
  );
}

export function fetchDiscordHealth(
  baseUrl?: string,
  fetchImpl?: typeof fetch,
): Promise<HealthFetchResult<DiscordHealth>> {
  return fetchJsonHealth<DiscordHealth>(
    '/health/discord',
    baseUrl ?? resolveDiscordGatewayBaseUrl(),
    fetchImpl,
  );
}
