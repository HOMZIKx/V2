import type { DiscordGatewayConfig } from './discord-config.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Check one member against Discord's authoritative guild-member endpoint.
 *
 * A 404 from a guild the gateway is already known to be joined to means the
 * user is not a member. Other failures are deliberately propagated so callers
 * can treat them as inconclusive instead of revoking access on an outage.
 */
export async function probeDiscordGuildMember(
  config: Pick<DiscordGatewayConfig, 'DISCORD_TOKEN'>,
  guildId: string,
  discordUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(
    `${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bot ${config.DISCORD_TOKEN}`,
      },
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`discord_member_probe_${String(response.status)}`);
  }
  return true;
}
