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
 * DM interactions tied to one guild should pass that guild's id.
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

/**
 * Team-scoped DMs (character timers / team reminders) are not initiated from one
 * Discord guild context. Do not pin them to DISCORD_TEST_GUILD_ID in production.
 * If per-guild configuration exists, at least one enabled configured guild must
 * explicitly allow the module/right. Recipients are still independently restricted
 * to the team's prefs-filtered Discord allowlist.
 */
export function evaluateTeamScopedModuleGate(input: {
  readonly config: BotConfigValues;
  readonly module: GuildModuleKey;
  readonly right?: GuildRight;
}): GuildModuleGateResult {
  const guilds = input.config.guilds ?? {};
  const entries = Object.entries(guilds);
  if (entries.length === 0) {
    return { allowed: true, guildId: 'legacy', source: 'legacy' };
  }

  let sawEnabled = false;
  let sawModule = false;
  for (const [guildId, guild] of entries) {
    if (!/^\d{17,20}$/.test(guildId)) continue;
    if (!guild.enabled) continue;
    sawEnabled = true;
    if (!guild.modules[input.module]) continue;
    sawModule = true;
    if (input.right && !guild.rights.includes(input.right)) continue;
    return { allowed: true, guildId, source: 'guild' };
  }

  if (!sawEnabled) {
    return { allowed: false, guildId: 'team', reason: 'guild_disabled' };
  }
  if (!sawModule) {
    return { allowed: false, guildId: 'team', reason: 'module_disabled' };
  }
  return { allowed: false, guildId: 'team', reason: 'right_missing' };
}
