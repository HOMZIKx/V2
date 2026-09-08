/**
 * memberActivity — OpenAPI paths (gateway :4100 via /api/technik proxy):
 *   GET /discord/v1/member-activity/me?window=&discordUserId=
 *   GET /discord/v1/member-activity/ranking?window=&q=&full=1
 * Windows: 7d | 14d | 30d | since_bot
 * Honest offline when gateway unreachable (502 / network).
 */

export type MemberActivityConfig = {
  readonly enabled: boolean;
  readonly guildId: string;
  readonly memberRoleIds: readonly string[];
  readonly windowDays: number;
  readonly topN: number;
};

/** Destiled — default source guild from gateway capability. */
export const DEFAULT_MEMBER_ACTIVITY_GUILD_ID = '1543972927719080016';

export const DEFAULT_MEMBER_ACTIVITY: MemberActivityConfig = {
  enabled: true,
  guildId: DEFAULT_MEMBER_ACTIVITY_GUILD_ID,
  memberRoleIds: [],
  windowDays: 7,
  topN: 10,
};

export type RankingWindow = '7d' | '14d' | '30d' | 'since_bot';

export type RankingRow = {
  readonly discordUserId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly score: number;
  readonly rank?: number;
  readonly messages?: number;
  readonly voiceMinutes?: number;
};

export type RankingResult =
  | {
      readonly ok: true;
      readonly rows: readonly RankingRow[];
      readonly window: RankingWindow;
      readonly status: number;
      readonly totalMembers?: number;
      readonly guildId?: string;
      readonly collectorStartedAt?: string;
      readonly fromDayInclusive?: string;
      readonly toDayInclusive?: string;
      readonly offline?: false;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status: number;
      readonly detail?: string;
      readonly offline?: boolean;
    };

export type ApiReachability = 'checking' | 'live' | 'offline' | 'unavailable';

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: 'invalid_json', detail: raw.slice(0, 200) };
  }
}

function isOfflineStatus(status: number, parsed: Record<string, unknown>): boolean {
  if (status === 502 || status === 0) return true;
  return parsed.error === 'gateway_unreachable';
}

function discordAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (url.hostname !== 'cdn.discordapp.com' && url.hostname !== 'media.discordapp.net') {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function mapEntry(r: Record<string, unknown>): RankingRow {
  const display =
    typeof r.displayName === 'string' && r.displayName.trim()
      ? r.displayName
      : typeof r.name === 'string'
        ? r.name
        : typeof r.username === 'string'
          ? r.username
          : 'Gracz';
  const avatarUrl = discordAvatarUrl(r.avatarUrl);
  const row: RankingRow = {
    discordUserId:
      typeof r.discordUserId === 'string'
        ? r.discordUserId
        : typeof r.userId === 'string'
          ? r.userId
          : typeof r.id === 'string'
            ? r.id
            : '',
    displayName: display,
    ...(avatarUrl ? { avatarUrl } : {}),
    score: Number(r.score ?? r.total ?? 0),
  };
  const messages =
    typeof r.messageCount === 'number'
      ? r.messageCount
      : typeof r.messages === 'number'
        ? r.messages
        : undefined;
  const voice = typeof r.voiceMinutes === 'number' ? r.voiceMinutes : undefined;
  const rank = typeof r.rank === 'number' ? r.rank : undefined;
  return {
    ...row,
    ...(messages !== undefined ? { messages } : {}),
    ...(voice !== undefined ? { voiceMinutes: voice } : {}),
    ...(rank !== undefined ? { rank } : {}),
  };
}

function mapEntries(parsed: Record<string, unknown>): RankingRow[] {
  const raw = Array.isArray(parsed.entries)
    ? parsed.entries
    : Array.isArray(parsed.rows)
      ? parsed.rows
      : Array.isArray(parsed.items)
        ? parsed.items
        : Array.isArray(parsed.top)
          ? parsed.top
          : [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map(mapEntry)
    .filter((r) => /^\d{17,20}$/.test(r.discordUserId));
}

function coverageFields(parsed: Record<string, unknown>) {
  return {
    ...(typeof parsed.guildId === 'string' && parsed.guildId.trim()
      ? { guildId: parsed.guildId }
      : {}),
    ...(typeof parsed.collectorStartedAt === 'string' && parsed.collectorStartedAt.trim()
      ? { collectorStartedAt: parsed.collectorStartedAt }
      : {}),
    ...(typeof parsed.fromDayInclusive === 'string' && parsed.fromDayInclusive.trim()
      ? { fromDayInclusive: parsed.fromDayInclusive }
      : {}),
    ...(typeof parsed.toDayInclusive === 'string' && parsed.toDayInclusive.trim()
      ? { toDayInclusive: parsed.toDayInclusive }
      : {}),
  };
}

/** Feature-detect: ranking without full (no secret). Offline vs 404 vs live. */
export async function detectMemberActivityRanking(): Promise<ApiReachability> {
  try {
    const res = await fetch('/api/technik/member-activity/ranking?window=7d', {
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (isOfflineStatus(res.status, parsed)) return 'offline';
    if (res.status === 404 || res.status === 501) return 'unavailable';
    // 200, 400, 401, 403, 503 (secret missing on full) still mean route exists
    if (res.ok || res.status === 400 || res.status === 401 || res.status === 403 || res.status === 503) {
      return 'live';
    }
    return 'unavailable';
  } catch {
    return 'offline';
  }
}

export async function fetchMemberActivityRanking(opts: {
  readonly window: RankingWindow;
  readonly guildId?: string;
  readonly q?: string;
  /** Technika full list — proxy attaches x-technika-secret */
  readonly full?: boolean;
  /** Public top-N (default server-side); Pulpit uses 10. */
  readonly topN?: number;
}): Promise<RankingResult> {
  const qs = new URLSearchParams({ window: opts.window });
  if (opts.q && opts.q.trim()) qs.set('q', opts.q.trim());
  if (opts.guildId) qs.set('guildId', opts.guildId);
  if (opts.full) qs.set('full', '1');
  if (typeof opts.topN === 'number' && opts.topN > 0) qs.set('topN', String(Math.min(500, opts.topN)));

  const url = '/api/technik/member-activity/ranking?' + qs.toString();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const parsed = await parseJson(res);
    if (isOfflineStatus(res.status, parsed)) {
      return {
        ok: false,
        error: 'gateway_unreachable',
        status: res.status,
        detail:
          typeof parsed.detail === 'string'
            ? parsed.detail
            : 'Gateway Discord nie odpowiada.',
        offline: true,
      };
    }
    if (!res.ok) {
      const fail: RankingResult = {
        ok: false,
        error:
          typeof parsed.error === 'string'
            ? parsed.error
            : 'http_' + String(res.status),
        status: res.status,
      };
      if (typeof parsed.detail === 'string') {
        return { ...fail, detail: parsed.detail };
      }
      return fail;
    }
    const rows = mapEntries(parsed);
    const total = typeof parsed.totalMembers === 'number' ? parsed.totalMembers : undefined;
    return {
      ok: true,
      rows,
      window: opts.window,
      status: res.status,
      ...coverageFields(parsed),
      ...(total !== undefined ? { totalMembers: total } : {}),
    };
  } catch (e) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: e instanceof Error ? e.message : 'unknown',
      offline: true,
    };
  }
}

export async function fetchMyRanking(opts: {
  readonly window: RankingWindow;
  readonly discordUserId: string;
  readonly guildId?: string;
}): Promise<RankingResult> {
  if (!/^\d{17,20}$/.test(opts.discordUserId)) {
    return { ok: false, error: 'invalid_discord_user_id', status: 400 };
  }
  const qs = new URLSearchParams({
    window: opts.window,
    discordUserId: opts.discordUserId,
  });
  if (opts.guildId) qs.set('guildId', opts.guildId);
  try {
    const res = await fetch('/api/technik/member-activity/me?' + qs.toString(), {
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (isOfflineStatus(res.status, parsed)) {
      return {
        ok: false,
        error: 'gateway_unreachable',
        status: res.status,
        detail: 'Gateway Discord nie odpowiada.',
        offline: true,
      };
    }
    if (!res.ok) {
      const fail: RankingResult = {
        ok: false,
        error:
          typeof parsed.error === 'string'
            ? parsed.error
            : 'http_' + String(res.status),
        status: res.status,
      };
      if (typeof parsed.detail === 'string') {
        return { ...fail, detail: parsed.detail };
      }
      return fail;
    }
    const self =
      parsed.self && typeof parsed.self === 'object'
        ? mapEntry(parsed.self as Record<string, unknown>)
        : null;
    const top = mapEntries({ top: parsed.top });
    const rows = self
      ? [self, ...top.filter((r) => r.discordUserId !== self.discordUserId)]
      : top;
    return {
      ok: true,
      rows,
      window: opts.window,
      status: res.status,
      ...coverageFields(parsed),
    };
  } catch (e) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: e instanceof Error ? e.message : 'unknown',
      offline: true,
    };
  }
}

export function windowDaysToRankingWindow(days: number): RankingWindow {
  if (days === 14) return '14d';
  if (days === 30) return '30d';
  return '7d';
}

export function rankingWindowToDays(w: RankingWindow): number {
  if (w === '14d') return 14;
  if (w === '30d') return 30;
  return 7;
}
