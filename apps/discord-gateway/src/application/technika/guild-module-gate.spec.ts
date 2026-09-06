import { describe, expect, it } from 'vitest';

import { defaultBotConfigValues } from './capabilities.js';
import { evaluateGuildModuleGate } from './guild-module-gate.js';

const TEST_GUILD = '1534228693017432124';

describe('evaluateGuildModuleGate', () => {
  it('allows when no guilds configured (legacy global)', () => {
    const config = defaultBotConfigValues();
    const result = evaluateGuildModuleGate({
      config,
      guildId: TEST_GUILD,
      module: 'characterTimers',
      right: 'discord.notify',
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.source).toBe('legacy');
  });

  it('denies when guilds exist but TEST guild missing', () => {
    const config = {
      ...defaultBotConfigValues(),
      guilds: {
        '999999999999999999': {
          enabled: true,
          modules: {
            characterTimers: true,
            kingdomWar: false,
            panels: true,
            channels: false,
          },
          rights: ['discord.notify' as const],
        },
      },
    };
    const result = evaluateGuildModuleGate({
      config,
      guildId: TEST_GUILD,
      module: 'characterTimers',
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('guild_not_configured');
  });

  it('denies when characterTimers module disabled for TEST guild', () => {
    const config = {
      ...defaultBotConfigValues(),
      guilds: {
        [TEST_GUILD]: {
          enabled: true,
          modules: {
            characterTimers: false,
            kingdomWar: false,
            panels: true,
            channels: false,
          },
          rights: ['discord.notify' as const, 'technika.config' as const],
        },
      },
    };
    const result = evaluateGuildModuleGate({
      config,
      guildId: TEST_GUILD,
      module: 'characterTimers',
      right: 'discord.notify',
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('module_disabled');
  });

  it('allows when TEST guild enabled with characterTimers + notify right', () => {
    const config = {
      ...defaultBotConfigValues(),
      guilds: {
        [TEST_GUILD]: {
          enabled: true,
          displayName: 'TEST',
          modules: {
            characterTimers: true,
            kingdomWar: false,
            panels: true,
            channels: false,
          },
          rights: ['discord.notify' as const, 'technika.config' as const],
        },
      },
    };
    const result = evaluateGuildModuleGate({
      config,
      guildId: TEST_GUILD,
      module: 'characterTimers',
      right: 'discord.notify',
    });
    expect(result).toEqual({
      allowed: true,
      guildId: TEST_GUILD,
      source: 'guild',
    });
  });
});
