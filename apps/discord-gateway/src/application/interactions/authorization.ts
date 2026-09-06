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

/**
 * Timer / war DM buttons arrive with guildId=null.
 * Allow DMs only for signed timer/war component actions; guild traffic stays isolated.
 */
export function isAllowedInteractionContext(input: {
  guildId: string | null | undefined;
  allowedGuildId: string;
  allowDm: boolean;
}): boolean {
  if (input.guildId == null || input.guildId === undefined) {
    return input.allowDm;
  }
  return isAllowedGuild(input.guildId, input.allowedGuildId);
}
