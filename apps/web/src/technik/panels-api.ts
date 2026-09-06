/**
 * Browser client for bot Discord panels / channels ops (Technika).
 * Prefers New Bot guild-scoped routes; falls back to query-style /panels*.
 *
 * Guild-scoped (preferred):
 *   GET  /discord/v1/guilds/{guildId}/channels
 *   GET  /discord/v1/guilds/{guildId}/panels
 *   POST /discord/v1/guilds/{guildId}/panels/publish
 *   POST /discord/v1/guilds/{guildId}/panels/{panelId}/refresh
 *   POST /discord/v1/guilds/{guildId}/panels/{panelId}/delete
 *
 * Query-style fallback:
 *   GET/POST/DELETE /discord/v1/panels*
 */

import { TECHNIK_TEST_GUILD_ID } from './technika-config-api';

export type PanelsApiStatus = 'checking' | 'live' | 'unavailable';

export type PanelChannel = {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly canPublish: boolean;
};

export type PanelMessage = {
  readonly messageId: string;
  readonly isComponentsV2: boolean;
  readonly jumpUrl: string;
  readonly channelId?: string;
  readonly kind?: string;
  readonly panelId?: string;
};

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
  const detail =
    typeof parsed.detail === 'string'
      ? parsed.detail
      : typeof parsed.hint === 'string'
        ? parsed.hint
        : undefined;
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

function stringField(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function mapChannels(parsed: Record<string, unknown>): PanelChannel[] {
  const raw = Array.isArray(parsed.channels) ? parsed.channels : [];
  return raw
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map((c) => ({
      id: stringField(c.id),
      name: typeof c.name === 'string' ? c.name : stringField(c.id),
      type: typeof c.type === 'number' ? c.type : 0,
      canPublish: Boolean(c.canPublish),
    }))
    .filter((c) => /^\d{17,20}$/.test(c.id));
}

function mapPanels(parsed: Record<string, unknown>, fallbackChannelId?: string): PanelMessage[] {
  const raw = Array.isArray(parsed.panels)
    ? parsed.panels
    : Array.isArray(parsed.items)
      ? parsed.items
      : [];
  return raw
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .map((p) => ({
      messageId: stringField(p.messageId ?? p.id ?? p.panelId),
      panelId: stringField(p.panelId ?? p.messageId ?? p.id),
      isComponentsV2: p.isComponentsV2 !== false,
      jumpUrl: typeof p.jumpUrl === 'string' ? p.jumpUrl : '',
      ...(typeof p.channelId === 'string'
        ? { channelId: p.channelId }
        : fallbackChannelId
          ? { channelId: fallbackChannelId }
          : {}),
      ...(typeof p.kind === 'string' ? { kind: p.kind } : {}),
    }))
    .filter((p) => /^\d{17,20}$/.test(p.messageId));
}

/** Feature-detect: guild-scoped channels, then query-style. */
export async function detectPanelsApi(
  guildId: string = TECHNIK_TEST_GUILD_ID,
): Promise<PanelsApiStatus> {
  try {
    const guildScoped = await fetch(
      '/api/technik/guilds/' + encodeURIComponent(guildId) + '/channels',
      { cache: 'no-store' },
    );
    if (guildScoped.status !== 404 && guildScoped.status !== 501) {
      if (
        guildScoped.ok ||
        guildScoped.status === 401 ||
        guildScoped.status === 403 ||
        guildScoped.status === 400 ||
        guildScoped.status === 503
      ) {
        return 'live';
      }
    }
    const res = await fetch(
      '/api/technik/panels/channels?guildId=' + encodeURIComponent(guildId),
      { cache: 'no-store' },
    );
    if (res.status === 404 || res.status === 501) return 'unavailable';
    if (res.status === 401 || res.status === 403 || res.ok || res.status === 400 || res.status === 503) {
      return 'live';
    }
    if (res.status >= 500) return 'unavailable';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function fetchPanelChannels(
  guildId: string,
): Promise<PanelsApiResult<{ channels: readonly PanelChannel[]; via: 'guild' | 'query' }>> {
  try {
    const gs = await fetch(
      '/api/technik/guilds/' + encodeURIComponent(guildId) + '/channels',
      { cache: 'no-store' },
    );
    if (gs.status !== 404 && gs.status !== 501) {
      const parsed = await parseJson(gs);
      if (!gs.ok) return fail(gs, parsed, 'http_' + String(gs.status));
      return { ok: true, status: gs.status, data: { channels: mapChannels(parsed), via: 'guild' } };
    }
    const res = await fetch(
      '/api/technik/panels/channels?guildId=' + encodeURIComponent(guildId),
      { cache: 'no-store' },
    );
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return { ok: true, status: res.status, data: { channels: mapChannels(parsed), via: 'query' } };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function fetchGuildPanels(
  guildId: string,
  channelId?: string,
): Promise<PanelsApiResult<{ panels: readonly PanelMessage[]; via: 'guild' | 'query' }>> {
  try {
    const gs = await fetch(
      '/api/technik/guilds/' + encodeURIComponent(guildId) + '/panels',
      { cache: 'no-store' },
    );
    if (gs.status !== 404 && gs.status !== 501) {
      const parsed = await parseJson(gs);
      if (!gs.ok) return fail(gs, parsed, 'http_' + String(gs.status));
      let panels = mapPanels(parsed);
      if (channelId) panels = panels.filter((p) => !p.channelId || p.channelId === channelId);
      return { ok: true, status: gs.status, data: { panels, via: 'guild' } };
    }
    if (!channelId) {
      return {
        ok: false,
        error: 'channel_required',
        status: 400,
        detail: 'Query-style list wymaga channelId.',
      };
    }
    const qs =
      'guildId=' +
      encodeURIComponent(guildId) +
      '&channelId=' +
      encodeURIComponent(channelId);
    const res = await fetch('/api/technik/panels?' + qs, { cache: 'no-store' });
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return {
      ok: true,
      status: res.status,
      data: { panels: mapPanels(parsed, channelId), via: 'query' },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export type PanelPublishBody = {
  readonly guildId: string;
  readonly channelId: string;
  readonly kind?: string;
  /** Panel title (Centrum appearance). */
  readonly title?: string;
  /** Short description under title. */
  readonly description?: string;
  /** Accent color as #RRGGBB. */
  readonly accentHex?: string;
  readonly includeBanner?: boolean;
  /** Banner image URL when includeBanner is true. */
  readonly bannerUrl?: string;
  /** Enabled hub action ids (create/lfg/mine/notify/profile/forme). */
  readonly enabledActions?: readonly string[];
  /** Extra buttons under the post: [{id,label,style,action,...}]. */
  readonly customButtons?: readonly Record<string, string>[];
};

function buildPublishPayload(body: PanelPublishBody): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    channelId: body.channelId,
    kind: body.kind ?? 'lab',
    includeBanner: body.includeBanner !== false,
  };
  if (typeof body.title === 'string' && body.title.trim()) payload.title = body.title.trim();
  if (typeof body.description === 'string') payload.description = body.description;
  if (typeof body.accentHex === 'string' && body.accentHex.trim()) {
    payload.accentHex = body.accentHex.trim();
  }
  if (typeof body.bannerUrl === 'string' && body.bannerUrl.trim()) {
    payload.bannerUrl = body.bannerUrl.trim();
  }
  if (body.enabledActions) {
    payload.enabledActions = [...body.enabledActions];
  }
  if (body.customButtons) {
    payload.customButtons = body.customButtons.map((b) => ({ ...b }));
  }
  return payload;
}

export async function postPanelPublish(body: PanelPublishBody): Promise<
  PanelsApiResult<{ messageId: string; jumpUrl: string; channelId: string; panelId?: string }>
> {
  try {
    const publishBody = buildPublishPayload(body);
    const gs = await fetch(
      '/api/technik/guilds/' + encodeURIComponent(body.guildId) + '/panels/publish',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(publishBody),
        cache: 'no-store',
      },
    );
    if (gs.status !== 404 && gs.status !== 501) {
      const parsed = await parseJson(gs);
      if (!gs.ok) return fail(gs, parsed, 'http_' + String(gs.status));
      return {
        ok: true,
        status: gs.status,
        data: {
          messageId: stringField(parsed.messageId),
          jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',
          channelId: stringField(parsed.channelId, body.channelId),
          panelId: stringField(parsed.panelId ?? parsed.messageId),
        },
      };
    }
    const res = await fetch('/api/technik/panels/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...publishBody, guildId: body.guildId }),
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return {
      ok: true,
      status: res.status,
      data: {
        messageId: stringField(parsed.messageId),
        jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',
        channelId: stringField(parsed.channelId, body.channelId),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postPanelPreview(
  guildId: string,
): Promise<PanelsApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch('/api/technik/panels/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildId }),
      cache: 'no-store',
    });
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

export async function postPanelRefresh(body: {
  readonly guildId: string;
  readonly panelId: string;
}): Promise<PanelsApiResult<{ refreshed: true; messageId: string; jumpUrl: string }>> {
  try {
    const res = await fetch(
      '/api/technik/guilds/' +
        encodeURIComponent(body.guildId) +
        '/panels/' +
        encodeURIComponent(body.panelId) +
        '/refresh',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' },
    );
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return {
      ok: true,
      status: res.status,
      data: {
        refreshed: true,
        messageId: stringField(parsed.messageId, body.panelId),
        jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function deletePanelMessage(body: {
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
}): Promise<PanelsApiResult<{ deleted: true; messageId: string }>> {
  try {
    const gs = await fetch(
      '/api/technik/guilds/' +
        encodeURIComponent(body.guildId) +
        '/panels/' +
        encodeURIComponent(body.messageId) +
        '/delete',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' },
    );
    if (gs.status !== 404 && gs.status !== 501) {
      const parsed = await parseJson(gs);
      if (!gs.ok) return fail(gs, parsed, 'http_' + String(gs.status));
      return {
        ok: true,
        status: gs.status,
        data: { deleted: true, messageId: stringField(parsed.messageId, body.messageId) },
      };
    }
    const res = await fetch('/api/technik/panels', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (!res.ok) return fail(res, parsed, 'http_' + String(res.status));
    return {
      ok: true,
      status: res.status,
      data: { deleted: true, messageId: stringField(parsed.messageId, body.messageId) },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}
