import type { APIAllowedMentions } from 'discord.js';

/**
 * Discord allowedMentions that never enables @everyone, @here, or broad user/role parsing.
 * Optional role IDs may be whitelisted for future product pings.
 */
export function buildSafeAllowedMentions(allowedRoleIds?: readonly string[]): APIAllowedMentions {
  return {
    parse: [],
    users: [],
    roles: allowedRoleIds !== undefined ? [...allowedRoleIds] : [],
  };
}
