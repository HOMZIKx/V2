/**
 * Resolve which Discord guild to show on member Pulpit for activity/ranking.
 * Priority (Mateusz): Destiled > only Sojusz > only one known > empty.
 * Best-effort: viewer guild list if present, else probe /member-activity/me.
 */

import {
  DEFAULT_MEMBER_ACTIVITY_GUILD_ID,
  fetchMyRanking,
  type RankingWindow,
} from './technik/member-activity-api';
import { KNOWN_GUILD_NAMES } from './technik/technika-config-api';

export const DESTILED_GUILD_ID = DEFAULT_MEMBER_ACTIVITY_GUILD_ID; // 1543972927719080016
export const SOJUSZ_GUILD_ID = '1531318787058696424';

export const MEMBER_ACTIVITY_KNOWN_GUILDS = [
  { id: DESTILED_GUILD_ID, name: KNOWN_GUILD_NAMES[DESTILED_GUILD_ID] ?? 'Destiled' },
  { id: SOJUSZ_GUILD_ID, name: KNOWN_GUILD_NAMES[SOJUSZ_GUILD_ID] ?? 'Projekt Sojusz' },
] as const;

export type ResolvedMemberActivityGuild = {
  readonly guildId: string;
  readonly guildName: string;
  /** How we decided — shown lightly in UI. */
  readonly method: 'viewer_guilds' | 'probe_me';
};

function readViewerGuildIds(viewer: unknown): string[] {
  if (!viewer || typeof viewer !== 'object') return [];
  const v = viewer as Record<string, unknown>;
  const candidates = [v.discordGuildIds, v.guildIds, v.discordGuilds, v.guilds];
  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    const ids: string[] = [];
    for (const item of c) {
      if (typeof item === 'string' && /^\d{17,20}$/.test(item)) ids.push(item);
      else if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id;
        if (typeof id === 'string' && /^\d{17,20}$/.test(id)) ids.push(id);
      }
    }
    if (ids.length) return [...new Set(ids)];
  }
  return [];
}

export function pickMemberActivityGuildFromIds(memberOf: readonly string[]): ResolvedMemberActivityGuild | null {
  return pickFromKnownMembership(memberOf);
}

function pickFromKnownMembership(memberOf: readonly string[]): ResolvedMemberActivityGuild | null {
  const knownIds = MEMBER_ACTIVITY_KNOWN_GUILDS.map((g) => g.id);
  const hit = memberOf.filter((id) => knownIds.includes(id));
  if (hit.includes(DESTILED_GUILD_ID)) {
    return {
      guildId: DESTILED_GUILD_ID,
      guildName: KNOWN_GUILD_NAMES[DESTILED_GUILD_ID] ?? 'Destiled',
      method: 'viewer_guilds',
    };
  }
  if (hit.length === 1 && hit[0] === SOJUSZ_GUILD_ID) {
    return {
      guildId: SOJUSZ_GUILD_ID,
      guildName: KNOWN_GUILD_NAMES[SOJUSZ_GUILD_ID] ?? 'Projekt Sojusz',
      method: 'viewer_guilds',
    };
  }
  if (hit.length === 1) {
    const id = hit[0]!;
    return {
      guildId: id,
      guildName: KNOWN_GUILD_NAMES[id] ?? 'Serwer Discord',
      method: 'viewer_guilds',
    };
  }
  return null;
}

async function probeMeOnGuild(
  discordUserId: string,
  guildId: string,
  window: RankingWindow,
): Promise<boolean> {
  const me = await fetchMyRanking({ window, discordUserId, guildId });
  if (!me.ok) return false;
  // Self row present ⇒ tracked on that guild (even score 0).
  return me.rows.some((r) => r.discordUserId === discordUserId);
}

/**
 * Resolve guild for Pulpit activity.
 * Returns null when we cannot honestly pick a single known guild.
 */
export async function resolveMemberActivityGuild(opts: {
  readonly discordUserId: string;
  readonly viewer?: unknown;
  readonly window?: RankingWindow;
}): Promise<ResolvedMemberActivityGuild | null> {
  const window = opts.window ?? '7d';
  if (!/^\d{17,20}$/.test(opts.discordUserId)) return null;

  const fromViewer = pickFromKnownMembership(readViewerGuildIds(opts.viewer));
  if (fromViewer) return fromViewer;

  // Probe Destiled first (priority), then Sojusz only if Destiled miss.
  if (await probeMeOnGuild(opts.discordUserId, DESTILED_GUILD_ID, window)) {
    return {
      guildId: DESTILED_GUILD_ID,
      guildName: KNOWN_GUILD_NAMES[DESTILED_GUILD_ID] ?? 'Destiled',
      method: 'probe_me',
    };
  }
  if (await probeMeOnGuild(opts.discordUserId, SOJUSZ_GUILD_ID, window)) {
    return {
      guildId: SOJUSZ_GUILD_ID,
      guildName: KNOWN_GUILD_NAMES[SOJUSZ_GUILD_ID] ?? 'Projekt Sojusz',
      method: 'probe_me',
    };
  }
  return null;
}
