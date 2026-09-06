import type {
  BotConfigValues,
  GuildModuleFlags,
  GuildRight,
} from './capabilities.js';

export type GuildModuleKey = keyof GuildModuleFlags;

export type GuildModuleGateResult =
  | { readonly allowed: true; readonly guildId: string; readonly source: 'legacy' | 'guild' }
  | {
      readonly allowed: false;
      readonly guildId: string;
      readonly reason:
        | 'guild_not_configured'
        | 'guild_disabled'
        | 'module_disabled'
        | 'right_missing'
        | 'invalid_guild_id';
    };

/**
 * Per-guild modules/rights enforcement (Technika guilds map).
 *
 * When `config.guilds` is empty → legacy global path (allowed=true, source=legacy).
 * When guilds exist → require enabled guild + module flag (+ optional right).
 * DM interactions should pass DISCORD_TEST_GUILD_ID as guildId.
 */
export function evaluateGuildModuleGate(input: {
  readonly config: BotConfigValues;
  readonly guildId: string | null | undefined;
  readonly module: GuildModuleKey;
  readonly right?: GuildRight;
}): GuildModuleGateResult {
  const guilds = input.config.guilds ?? {};
  const guildIds = Object.keys(guilds);
  const guildId = (input.guildId ?? '').trim();

  if (guildIds.length === 0) {
    return {
      allowed: true,
      guildId: guildId || 'legacy',
      source: 'legacy',
    };
  }

  if (!/^\d{17,20}$/.test(guildId)) {
    return { allowed: false, guildId: guildId || 'unknown', reason: 'invalid_guild_id' };
  }

  const guild = guilds[guildId];
  if (!guild) {
    return { allowed: false, guildId, reason: 'guild_not_configured' };
  }
  if (!guild.enabled) {
    return { allowed: false, guildId, reason: 'guild_disabled' };
  }
  if (!guild.modules[input.module]) {
    return { allowed: false, guildId, reason: 'module_disabled' };
  }
  if (input.right && !guild.rights.includes(input.right)) {
    return { allowed: false, guildId, reason: 'right_missing' };
  }

  return { allowed: true, guildId, source: 'guild' };
}
