/**
 * Unify WWW ↔ Discord-bot owner keys for player-team demo header.
 *
 * Web stores snapshots under bare Discord snowflake when OAuth linked
 * (`viewer.id` = discordAccountId). Older bot paths used `discord:<snowflake>`.
 * Canonical key = bare snowflake; lookups try aliases for back-compat.
 */

const SNOWFLAKE_RE = /^\d{17,20}$/;
const DISCORD_PREFIX_RE = /^discord:(\d{17,20})$/i;

export function canonicalOwnerViewerId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return trimmed;
  const prefixed = DISCORD_PREFIX_RE.exec(trimmed);
  if (prefixed?.[1]) return prefixed[1];
  return trimmed;
}

/** Ordered unique candidates for GET/PUT /player-team/v1/me/state. */
export function ownerViewerIdCandidates(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  const canonical = canonicalOwnerViewerId(trimmed);
  const out: string[] = [];
  const push = (value: string) => {
    if (value.length > 0 && !out.includes(value)) out.push(value);
  };
  push(canonical);
  if (SNOWFLAKE_RE.test(canonical)) {
    push(`discord:${canonical}`);
  }
  push(trimmed);
  return out;
}

export function isDiscordSnowflake(value: string): boolean {
  return SNOWFLAKE_RE.test(value.trim());
}
