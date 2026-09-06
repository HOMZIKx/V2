/**
 * Browser client for bot Discord panels ops (Technika).
 * Calls same-origin /api/technik/* — feature-detect before enabling UI actions.
 * Contract (New Bot):
 *   GET  /discord/v1/guilds/{guildId}/panels
 *   POST /discord/v1/guilds/{guildId}/panels/publish
 *   POST /discord/v1/guilds/{guildId}/panels/{panelId}/refresh
 *   POST /discord/v1/guilds/{guildId}/panels/{panelId}/delete
 *   GET  /discord/v1/guilds/{guildId}/channels
 */

export type PanelsApiStatus = 'checking' | 'live' | 'unavailable';

export type PanelsApiResult<T> =
  | { readonly ok: true; readonly data: T; readonly status: number }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status: number;
      readonly detail?: string;
      readonly body?: unknown;
    };

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: 'invalid_json', detail: raw.slice(0, 200) };
  }
}

function fail(res: Response, parsed: Record<string, unknown>, fallback: string): PanelsApiResult<never> {
  const detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
  return {
    ok: false,
    error:
      typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.message === 'string'
          ? parsed.message
          : fallback,
    status: res.status,
    ...(detail ? { detail } : {}),
    body: parsed,
  };
}

export async function detectPanelsApi(guildId: string): Promise<PanelsApiStatus> {
  try {
    const res = await fetch('/api/technik/guilds/' + encodeURIComponent(guildId) + '/panels', {
      cache: 'no-store',
    });
    if (res.status === 404 || res.status === 501) return 'unavailable';
    // 401/403 with JSON body often means route exists but auth/guild gate — treat as live shape
    if (res.status === 401 || res.status === 403) return 'live';
    if (res.ok) return 'live';
    if (res.status >= 500) return 'unavailable';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function fetchGuildPanels(
  guildId: string,
): Promise<PanelsApiResult<{ panels: readonly Record<string, unknown>[] }>> {
  try {
    const res = await fetch('/api/technik/guilds/' + encodeURIComponent(guildId) + '/panels', {
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    const panels = Array.isArray(parsed.panels)
      ? (parsed.panels as Record<string, unknown>[])
      : Array.isArray(parsed.items)
        ? (parsed.items as Record<string, unknown>[])
        : [];
    return { ok: true, status: res.status, data: { panels } };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function fetchGuildChannels(
  guildId: string,
): Promise<PanelsApiResult<{ channels: readonly Record<string, unknown>[] }>> {
  try {
    const res = await fetch('/api/technik/guilds/' + encodeURIComponent(guildId) + '/channels', {
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    const channels = Array.isArray(parsed.channels)
      ? (parsed.channels as Record<string, unknown>[])
      : Array.isArray(parsed.items)
        ? (parsed.items as Record<string, unknown>[])
        : [];
    return { ok: true, status: res.status, data: { channels } };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postPanelPublish(
  guildId: string,
  body: { readonly channelId?: string },
): Promise<PanelsApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(
      '/api/technik/guilds/' + encodeURIComponent(guildId) + '/panels/publish',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      },
    );
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return { ok: true, status: res.status, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postPanelRefresh(
  guildId: string,
  panelId: string,
): Promise<PanelsApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(
      '/api/technik/guilds/' +
        encodeURIComponent(guildId) +
        '/panels/' +
        encodeURIComponent(panelId) +
        '/refresh',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      },
    );
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return { ok: true, status: res.status, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postPanelDelete(
  guildId: string,
  panelId: string,
): Promise<PanelsApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(
      '/api/technik/guilds/' +
        encodeURIComponent(guildId) +
        '/panels/' +
        encodeURIComponent(panelId) +
        '/delete',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      },
    );
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return { ok: true, status: res.status, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}
