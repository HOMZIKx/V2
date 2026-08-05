import { GatewayIntentBits, Routes } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { DiscordGatewayConfigSchema, normalizeDiscordConfig } from './discord-config.js';
import {
  assertAllowedGatewayIntents,
  assertOnlyGuildsIntent,
  DiscordJsGatewayAdapter,
} from './discord-js-adapter.js';

function makeConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
    }),
  );
}

describe('DiscordJsGatewayAdapter', () => {
  it('permits Guilds and GuildMembers intents only', () => {
    expect(() =>
      assertAllowedGatewayIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]),
    ).not.toThrow();
    expect(() => assertOnlyGuildsIntent([GatewayIntentBits.Guilds])).toThrow();
    expect(() =>
      assertAllowedGatewayIntents([
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
      ]),
    ).toThrow();
  });

  it('starts as disabled without login when Discord is off', async () => {
    const config = normalizeDiscordConfig(
      DiscordGatewayConfigSchema.parse({ DISCORD_ENABLED: 'false' }),
    );
    const adapter = new DiscordJsGatewayAdapter({
      config,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onInteraction: () => Promise.resolve(),
    });
    await adapter.start();
    expect(adapter.getState()).toBe('disabled');
    await adapter.stop();
    expect(adapter.getState()).toBe('disabled');
  });

  it('registers commands only through guild routes', async () => {
    const adapter = new DiscordJsGatewayAdapter({
      config: makeConfig(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onInteraction: () => Promise.resolve(),
    });

    const restPut = vi.fn(() => Promise.resolve([{ id: '1', name: 'status' }]));
    Object.defineProperty(adapter, 'rest', {
      value: { put: restPut },
    });

    const route = Routes.applicationGuildCommands('100000000000000001', '1534228693017432124');
    expect(route.includes('/guilds/')).toBe(true);
    expect(Routes.applicationCommands('100000000000000001').includes('/guilds/')).toBe(false);

    const result = await adapter.putGuildCommands('1534228693017432124', [
      { name: 'status', description: 'x', version: 'p1.0.0' },
    ]);
    expect(result[0]?.name).toBe('status');
    const calls = restPut.mock.calls as unknown as Array<[unknown]>;
    const firstArg = calls[0]?.[0];
    expect(typeof firstArg === 'string' ? firstArg : '').toContain('/guilds/');
  });
});
