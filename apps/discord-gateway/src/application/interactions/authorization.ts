export type AuthorizationResult =
  { allowed: true; reason: 'operator' | 'manage_guild' } | { allowed: false; reason: 'denied' };

export function authorizePanelOperator(input: {
  userId: string;
  operatorIds: string[];
  memberPermissionsBitfield?: bigint | null;
}): AuthorizationResult {
  if (input.operatorIds.includes(input.userId)) {
    return { allowed: true, reason: 'operator' };
  }

  const manageGuild = 0x20n;
  if (
    input.memberPermissionsBitfield !== undefined &&
    input.memberPermissionsBitfield !== null &&
    (input.memberPermissionsBitfield & manageGuild) === manageGuild
  ) {
    return { allowed: true, reason: 'manage_guild' };
  }

  return { allowed: false, reason: 'denied' };
}

export function isAllowedGuild(
  guildId: string | null | undefined,
  allowedGuildId: string,
): boolean {
  return guildId === allowedGuildId;
}
