/**
 * Web-side membership watchdog (DESTILED).
 *
 * Hard rule: leave/kick from ALL bot-served Discord guilds → lose app access.
 * Web can only enforce what Identity / proxy exposes:
 *  1) Identity session gone (fetchIdentityMe → null/401) → revoke immediately.
 *  2) Guild membership: probe GET /api/technik/guilds/{id}/members/{userId}
 *     for known bot guilds. Revoke ONLY when every guild returns an explicit
 *     not-a-member answer. Never revoke on empty ranking, offline gateway,
 *     missing endpoint, or ambiguous 404.
 *
 * Full kick enforcement belongs to Identity/OAuth (New Bot). This is the
 * strongest safe web path without false positives.
 */

import { fetchIdentityMe, isIdentityAuthClientEnabled } from './identity-auth-client';

export const BOT_GUILD_IDS = [
  '1543972927719080016', // Destiled
  '1531318787058696424', // Projekt Sojusz
  '1534228693017432124', // Testowy
] as const;

export const MEMBERSHIP_CHECK_MS = 10 * 60 * 1000; // 10 min

export type MembershipProbeResult =
  | { readonly kind: 'member' }
  | { readonly kind: 'not_member' }
  | { readonly kind: 'inconclusive'; readonly reason: string };

function parseMemberBody(status: number, body: unknown): MembershipProbeResult {
  if (status === 200 || status === 204) {
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      if (o.member === false || o.isMember === false || o.inGuild === false) {
        return { kind: 'not_member' };
      }
      if (o.error === 'not_a_member' || o.error === 'not_found' || o.code === 'not_a_member') {
        return { kind: 'not_member' };
      }
    }
    return { kind: 'member' };
  }
  if (status === 404) {
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      const err = String(o.error ?? o.code ?? '').toLowerCase();
      if (
        err === 'not_a_member' ||
        err === 'member_not_found' ||
        err === 'unknown_member' ||
        err === 'not_found_member'
      ) {
        return { kind: 'not_member' };
      }
      // Path-level 404 / gateway not_found → endpoint missing, do not revoke.
      if (err === 'not_found' || err === 'not_implemented' || err === 'unknown_route') {
        return { kind: 'inconclusive', reason: 'endpoint_missing:' + err };
      }
    }
    return { kind: 'inconclusive', reason: 'http_404_ambiguous' };
  }
  if (status === 401 || status === 403) {
    // Auth failure on guild probe ≠ kick; Identity check handles session.
    return { kind: 'inconclusive', reason: 'http_' + String(status) };
  }
  return { kind: 'inconclusive', reason: 'http_' + String(status) };
}

export async function probeGuildMember(
  guildId: string,
  discordUserId: string,
): Promise<MembershipProbeResult> {
  if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(discordUserId)) {
    return { kind: 'inconclusive', reason: 'bad_ids' };
  }
  try {
    const res = await fetch(
      '/api/technik/guilds/' + guildId + '/members/' + discordUserId,
      { method: 'GET', cache: 'no-store' },
    );
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return parseMemberBody(res.status, body);
  } catch (e) {
    return {
      kind: 'inconclusive',
      reason: e instanceof Error ? e.message : 'network',
    };
  }
}

/**
 * Returns true when we should revoke the local session.
 * Safe: only true on Identity loss OR definitive not-member across ALL bot guilds.
 */
export async function shouldRevokeAppAccess(opts: {
  readonly discordUserId: string | null | undefined;
}): Promise<{ readonly revoke: boolean; readonly reason: string }> {
  if (isIdentityAuthClientEnabled()) {
    try {
      const me = await fetchIdentityMe();
      if (!me) {
        return { revoke: true, reason: 'identity_session_gone' };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('401') || msg.includes('identity_me_401')) {
        return { revoke: true, reason: 'identity_session_401' };
      }
      // Identity offline — do not revoke (could be temporary).
      return { revoke: false, reason: 'identity_unreachable' };
    }
  }

  const discordUserId = (opts.discordUserId ?? '').trim();
  if (!/^\d{17,20}$/.test(discordUserId)) {
    // No Discord id in session — cannot prove guild kick; Identity path above is enough.
    return { revoke: false, reason: 'no_discord_id' };
  }

  const results = await Promise.all(
    BOT_GUILD_IDS.map((id) => probeGuildMember(id, discordUserId)),
  );

  let anyMember = false;
  let anyInconclusive = false;
  let notMemberCount = 0;
  for (const r of results) {
    if (r.kind === 'member') anyMember = true;
    else if (r.kind === 'not_member') notMemberCount += 1;
    else anyInconclusive = true;
  }

  if (anyMember) return { revoke: false, reason: 'still_in_bot_guild' };
  if (!anyInconclusive && notMemberCount === BOT_GUILD_IDS.length) {
    return { revoke: true, reason: 'not_in_any_bot_guild' };
  }
  // Endpoint missing / gateway offline / mixed → never false-positive kick.
  return {
    revoke: false,
    reason: anyInconclusive
      ? 'guild_probe_inconclusive'
      : 'guild_probe_partial',
  };
}
