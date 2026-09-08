/** Ranking + /me aggregates from persisted daily buckets. */

import type { MemberActivityConfig } from '../technika/capabilities.js';
import { MemberActivityStore } from './member-activity-store.js';

export type ActivityWindow = '7d' | '14d' | '30d' | 'since_bot';

export type RankedMember = {
  readonly rank: number;
  readonly discordUserId: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly messageCount: number;
  readonly voiceMinutes: number;
  readonly score: number;
};

function shiftDay(dayKey: string, deltaDays: number): string {
  const [y = 1970, m = 1, d = 1] = dayKey.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utc));
}

export function resolveWindowRange(
  store: MemberActivityStore,
  window: ActivityWindow,
): { fromDayInclusive: string; toDayInclusive: string; window: ActivityWindow } {
  const toDayInclusive = store.dayKey();
  if (window === 'since_bot') {
    const fromDayInclusive = store.dayKey(new Date(store.getCollectorStartedAt()));
    return { fromDayInclusive, toDayInclusive, window };
  }
  const days = window === '7d' ? 7 : window === '14d' ? 14 : 30;
  return {
    fromDayInclusive: shiftDay(toDayInclusive, -(days - 1)),
    toDayInclusive,
    window,
  };
}

export function parseActivityWindow(raw: string | undefined, fallback: ActivityWindow): ActivityWindow {
  if (raw === '7d' || raw === '14d' || raw === '30d' || raw === 'since_bot') return raw;
  return fallback;
}

export class MemberActivityQuery {
  public constructor(
    private readonly store: MemberActivityStore,
    private readonly getConfig: () => MemberActivityConfig,
  ) {}

  public ranking(input: {
    readonly guildId?: string | undefined;
    readonly window?: string | undefined;
    readonly topN?: number | undefined;
    readonly q?: string | undefined;
    readonly full?: boolean | undefined;
  }) {
    const cfg = this.getConfig();
    const guildId = (input.guildId?.trim() || cfg.guildId).trim();
    const window = parseActivityWindow(
      input.window,
      cfg.windowDays === 14 ? '14d' : cfg.windowDays === 30 ? '30d' : '7d',
    );
    const range = resolveWindowRange(this.store, window);
    const agg = this.store.aggregate({ guildId, ...range });
    let rows = [...agg.entries()].map(([discordUserId, v]) => ({
      discordUserId,
      displayName: v.displayName ?? null,
      avatarUrl: v.avatarUrl ?? null,
      messageCount: v.messageCount,
      voiceMinutes: v.voiceMinutes,
      score: v.messageCount + v.voiceMinutes,
    }));
    const q = input.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.discordUserId.includes(q) ||
          (r.displayName ?? '').toLowerCase().includes(q),
      );
    }
    rows.sort(
      (a, b) =>
        b.score - a.score ||
        b.messageCount - a.messageCount ||
        a.discordUserId.localeCompare(b.discordUserId),
    );
    const totalMembers = rows.length;
    const limit = input.full ? rows.length : Math.max(1, Math.min(input.topN ?? cfg.topN, 500));
    const entries = rows.slice(0, limit).map((r, i) => ({
      rank: i + 1,
      discordUserId: r.discordUserId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      messageCount: r.messageCount,
      voiceMinutes: r.voiceMinutes,
      score: r.score,
    }));
    return {
      ok: true as const,
      guildId,
      window: range.window,
      fromDayInclusive: range.fromDayInclusive,
      toDayInclusive: range.toDayInclusive,
      collectorStartedAt: this.store.getCollectorStartedAt(),
      totalMembers,
      entries,
    };
  }

  public me(input: {
    readonly discordUserId: string;
    readonly guildId?: string | undefined;
    readonly window?: string | undefined;
  }) {
    const cfg = this.getConfig();
    const full = this.ranking({ guildId: input.guildId, window: input.window, full: true });
    const idx = full.entries.findIndex((e) => e.discordUserId === input.discordUserId);
    return {
      ok: true as const,
      guildId: full.guildId,
      window: full.window,
      fromDayInclusive: full.fromDayInclusive,
      toDayInclusive: full.toDayInclusive,
      collectorStartedAt: full.collectorStartedAt,
      self: idx >= 0 ? full.entries[idx]! : null,
      top: full.entries.slice(0, cfg.topN),
    };
  }
}
