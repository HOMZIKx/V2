import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { HealthController } from './health.controller.js';

function disabledConfig() {
  return normalizeDiscordConfig(DiscordGatewayConfigSchema.parse({ DISCORD_ENABLED: 'false' }));
}

function enabledConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '123456789012345678',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
    }),
  );
}

describe('HealthController', () => {
  it('reports live ok always', () => {
    const controller = new HealthController(disabledConfig(), null);
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('ready when discord disabled', () => {
    const controller = new HealthController(disabledConfig(), null);
    expect(controller.ready().status).toBe('ok');
  });

  it('ready fails when enabled but not ready', () => {
    const gateway = {
      getSnapshot: vi.fn(() => ({
        state: 'connecting',
        enabled: true,
        guildId: '1534228693017432124',
        pingMs: null,
        uptimeSeconds: 0,
        commandsRegistered: false,
        isolationOk: true,
        lastError: null,
      })),
    };
    const controller = new HealthController(enabledConfig(), gateway as never);
    expect(() => controller.ready()).toThrow(ServiceUnavailableException);
  });

  it('ready succeeds when enabled and ready with isolation', () => {
    const gateway = {
      getSnapshot: vi.fn(() => ({
        state: 'ready',
        enabled: true,
        guildId: '1534228693017432124',
        pingMs: 12,
        uptimeSeconds: 9,
        commandsRegistered: true,
        isolationOk: true,
        lastError: null,
      })),
    };
    const controller = new HealthController(enabledConfig(), gateway as never);
    expect(controller.ready()).toEqual({
      status: 'ok',
      discordEnabled: true,
      discordState: 'ready',
    });
  });

  it('discord health never exposes secrets', () => {
    const controller = new HealthController(disabledConfig(), null);
    const body = controller.discord();
    expect(JSON.stringify(body)).not.toMatch(/token|secret/i);
  });
});
