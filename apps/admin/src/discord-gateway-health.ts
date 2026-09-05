/**
 * New Bot (discord-gateway) health client for Technician Status / Diagnostyka.
 * Live Discord config and Activity REST are not available yet — do not invent data.
 */

export const DEFAULT_DISCORD_GATEWAY_BASE_URL = 'http://127.0.0.1:4100';

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
  envValue: string | undefined = import.meta.env.VITE_DISCORD_GATEWAY_BASE_URL,
): string {
  const trimmed = envValue?.trim();
  if (!trimmed) {
    return DEFAULT_DISCORD_GATEWAY_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

export function curlTipFor(path: string, baseUrl = resolveDiscordGatewayBaseUrl()): string {
  return `curl -sS "${baseUrl}${path}"`;
}

function networkErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const looksLikeCorsOrNetwork =
    /failed to fetch|networkerror|load failed|cors|blocked/i.test(raw) || raw === '';

  if (looksLikeCorsOrNetwork) {
    return (
      'Nie udało się pobrać zdrowia z przeglądarki (sieć/CORS). ' +
      'New Bot musi nasłuchiwać i zezwalać na origin Admina, albo sprawdź lokalnie przez curl.'
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
