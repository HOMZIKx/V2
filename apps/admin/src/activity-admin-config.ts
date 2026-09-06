/**
 * Optional READ client for activity-service guild admin catalogs (Technician).
 * Mutations / Discord apply stay with New Bot — never fake save success from Admin.
 *
 * Expected activity-admin paths (Controller: activity/v1/admin):
 *   GET  /activity/v1/admin/guilds/:guildId/config
 *   GET  /activity/v1/admin/guilds/:guildId/types
 *   GET  /activity/v1/admin/guilds/:guildId/statuses
 *   GET  /activity/v1/admin/guilds/:guildId/participant-fields
 *   GET  /activity/v1/admin/guilds/:guildId/channels
 *   GET  /activity/v1/admin/guilds/:guildId/ping-roles
 *   GET  /activity/v1/admin/guilds/:guildId/report-reasons
 *   GET  /activity/v1/admin/guilds/:guildId/audit
 *
 * Expected New Bot Discord config OpenAPI (NOT live yet — do not call until shipped):
 *   GET  /discord/v1/capabilities
 *   GET  /discord/v1/config
 *   PUT  /discord/v1/config
 *   POST /discord/v1/config/apply
 *   POST /discord/v1/config/rollback
 *   GET  /discord/v1/config/active-revision
 */

export type ActivityAdminReadOk<T> = {
  readonly ok: true;
  readonly data: T;
  readonly httpStatus: number;
  readonly path: string;
};

export type ActivityAdminReadErr = {
  readonly ok: false;
  readonly error: string;
  readonly kind: 'network' | 'http' | 'parse' | 'unset';
  readonly httpStatus?: number;
  readonly body?: unknown;
  readonly path: string;
  readonly curlTip: string;
};

export type ActivityAdminReadResult<T> = ActivityAdminReadOk<T> | ActivityAdminReadErr;

export type ActivityAdminEnv = {
  readonly baseUrl: string | undefined;
  readonly guildId: string | undefined;
};

export function resolveActivityAdminEnv(
  baseUrl: string | undefined = import.meta.env.VITE_ACTIVITY_ADMIN_BASE_URL,
  guildId: string | undefined = import.meta.env.VITE_ACTIVITY_ADMIN_GUILD_ID,
): ActivityAdminEnv {
  const trimmedBase = baseUrl?.trim().replace(/\/+$/, '') || undefined;
  const trimmedGuild = guildId?.trim() || undefined;
  return { baseUrl: trimmedBase, guildId: trimmedGuild };
}

export function isActivityAdminReadConfigured(env: ActivityAdminEnv = resolveActivityAdminEnv()): boolean {
  return Boolean(env.baseUrl && env.guildId);
}

export function activityAdminPath(guildId: string, suffix: string): string {
  const clean = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `/activity/v1/admin/guilds/${encodeURIComponent(guildId)}${clean}`;
}

export function activityAdminCurlTip(
  path: string,
  baseUrl: string,
): string {
  return `curl -sS "${baseUrl}${path}"`;
}

/** Documented New Bot Discord config paths — for UI + .env.example only until OpenAPI ships. */
export const EXPECTED_DISCORD_CONFIG_PATHS = [
  'GET  /discord/v1/capabilities',
  'GET  /discord/v1/config',
  'PUT  /discord/v1/config',
  'POST /discord/v1/config/apply',
  'POST /discord/v1/config/rollback',
  'GET  /discord/v1/config/active-revision',
] as const;

/** Documented activity-admin READ paths used when VITE_ACTIVITY_ADMIN_* is set. */
export const EXPECTED_ACTIVITY_ADMIN_READ_PATHS = [
  'GET /activity/v1/admin/guilds/:guildId/config',
  'GET /activity/v1/admin/guilds/:guildId/types',
  'GET /activity/v1/admin/guilds/:guildId/statuses',
  'GET /activity/v1/admin/guilds/:guildId/participant-fields',
  'GET /activity/v1/admin/guilds/:guildId/channels',
  'GET /activity/v1/admin/guilds/:guildId/ping-roles',
  'GET /activity/v1/admin/guilds/:guildId/report-reasons',
  'GET /activity/v1/admin/guilds/:guildId/audit',
] as const;

export async function fetchActivityAdminJson<T>(
  suffix: string,
  env: ActivityAdminEnv = resolveActivityAdminEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<ActivityAdminReadResult<T>> {
  if (!env.baseUrl || !env.guildId) {
    return {
      ok: false,
      kind: 'unset',
      path: suffix,
      error:
        'Odczyt activity-admin wyłączony — ustaw VITE_ACTIVITY_ADMIN_BASE_URL i VITE_ACTIVITY_ADMIN_GUILD_ID.',
      curlTip: 'Brak bazy activity-admin (env).',
    };
  }

  const path = activityAdminPath(env.guildId, suffix);
  const url = `${env.baseUrl}${path}`;
  const tip = activityAdminCurlTip(path, env.baseUrl);

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
        path,
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
        path,
        error: `activity-admin zwrócił HTTP ${response.status} dla ${path}.`,
        curlTip: tip,
      };
    }

    return { ok: true, data: data as T, httpStatus: response.status, path };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      kind: 'network',
      path,
      error:
        /failed to fetch|networkerror|load failed|cors|blocked/i.test(raw) || raw === ''
          ? 'Nie udało się odczytać activity-admin (sieć/CORS). Sprawdź lokalnie przez curl.'
          : `Nie udało się odczytać activity-admin: ${raw}`,
      curlTip: tip,
    };
  }
}

export type GuildConfigBundle = {
  readonly config: ActivityAdminReadResult<unknown>;
  readonly types: ActivityAdminReadResult<unknown>;
  readonly statuses: ActivityAdminReadResult<unknown>;
  readonly participantFields: ActivityAdminReadResult<unknown>;
  readonly channels: ActivityAdminReadResult<unknown>;
  readonly pingRoles: ActivityAdminReadResult<unknown>;
  readonly reportReasons: ActivityAdminReadResult<unknown>;
  readonly audit: ActivityAdminReadResult<unknown>;
};

export async function fetchGuildConfigBundle(
  env: ActivityAdminEnv = resolveActivityAdminEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<GuildConfigBundle | null> {
  if (!isActivityAdminReadConfigured(env)) {
    return null;
  }

  const [config, types, statuses, participantFields, channels, pingRoles, reportReasons, audit] =
    await Promise.all([
      fetchActivityAdminJson('/config', env, fetchImpl),
      fetchActivityAdminJson('/types', env, fetchImpl),
      fetchActivityAdminJson('/statuses', env, fetchImpl),
      fetchActivityAdminJson('/participant-fields', env, fetchImpl),
      fetchActivityAdminJson('/channels', env, fetchImpl),
      fetchActivityAdminJson('/ping-roles', env, fetchImpl),
      fetchActivityAdminJson('/report-reasons', env, fetchImpl),
      fetchActivityAdminJson('/audit', env, fetchImpl),
    ]);

  return {
    config,
    types,
    statuses,
    participantFields,
    channels,
    pingRoles,
    reportReasons,
    audit,
  };
}
