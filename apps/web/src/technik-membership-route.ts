export interface TechnikMembershipProbeTarget {
  readonly guildId: string;
  readonly userId: string;
}

const MEMBERSHIP_PATH = /^guilds\/(\d{17,20})\/members\/(\d{17,20})$/;

export function parseTechnikMembershipProbePath(
  path: string,
): TechnikMembershipProbeTarget | null {
  const match = MEMBERSHIP_PATH.exec(path);
  if (!match) return null;
  const guildId = match[1];
  const userId = match[2];
  if (!guildId || !userId) return null;
  return { guildId, userId };
}

export function canProbeOwnDiscordMembership(
  path: string,
  authenticatedDiscordUserId: string,
): boolean {
  const target = parseTechnikMembershipProbePath(path);
  return target !== null && target.userId === authenticatedDiscordUserId;
}
