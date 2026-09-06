/** In-memory war character claims for the day (stub until Kuzyn roster). */

type ClaimMap = Record<string, string>; // characterId -> discordUserId

let claims: ClaimMap = {};
let claimDayKey = '';

function warsawDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function ensureDay(): void {
  const key = warsawDayKey();
  if (key !== claimDayKey) {
    claimDayKey = key;
    claims = {};
  }
}

export function getKingdomWarClaims(): ClaimMap {
  ensureDay();
  return { ...claims };
}

export function countClaimsForUser(discordUserId: string): number {
  ensureDay();
  let n = 0;
  for (const userId of Object.values(claims)) {
    if (userId === discordUserId) n += 1;
  }
  return n;
}

export function claimKingdomWarCharacter(input: {
  readonly characterId: string;
  readonly discordUserId: string;
  /** Max characters one Discord user may hold (Technika kingdomWar.maxClaimsPerUser). */
  readonly maxClaimsPerUser?: number;
}):
  | { readonly ok: true; readonly claims: ClaimMap }
  | { readonly ok: false; readonly reason: 'taken' | 'max_claims' } {
  ensureDay();
  const maxClaims = Math.max(1, Math.min(20, input.maxClaimsPerUser ?? 3));
  const existing = claims[input.characterId];
  if (existing && existing !== input.discordUserId) {
    return { ok: false, reason: 'taken' };
  }
  // Re-selecting own claim is idempotent and does not consume an extra slot.
  if (existing === input.discordUserId) {
    return { ok: true, claims: { ...claims } };
  }
  const owned = countClaimsForUser(input.discordUserId);
  if (owned >= maxClaims) {
    return { ok: false, reason: 'max_claims' };
  }
  claims = { ...claims, [input.characterId]: input.discordUserId };
  return { ok: true, claims: { ...claims } };
}

export function resetKingdomWarClaimsForTests(): void {
  claims = {};
  claimDayKey = '';
}
