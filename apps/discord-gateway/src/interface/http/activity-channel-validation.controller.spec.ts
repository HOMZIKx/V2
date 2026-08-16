import { describe, expect, it, vi } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { ActivityChannelValidationController } from './activity-channel-validation.controller.js';

const secret = 's'.repeat(32);

function makeConfig(overrides: Record<string, string> = {}) {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: secret,
      DISCORD_ACTIVITY_ENABLED: 'true',
      ACTIVITY_ORGANIZATION_ID: 'org-test',
      ACTIVITY_CLIENT_MODE: 'headers',
      ACTIVITY_ENABLED: 'false',
      ACTIVITY_PROJECTION_SHARED_SECRET: 'proj-secret',
      ...overrides,
    }),
  );
}

describe('ActivityChannelValidationController', () => {
  it('validates channels and returns result codes', async () => {
    const validate = vi.fn((guildId: string, channelId: string) => {
      if (channelId === 'missing') {
        return Promise.resolve({ ok: false, code: 'CHANNEL_MISSING' as const });
      }
      if (channelId === 'wrong') {
        return Promise.resolve({
          ok: false,
          code: 'CHANNEL_WRONG_GUILD' as const,
          detail: `guild ${guildId}`,
        });
      }
      return Promise.resolve({ ok: true, code: 'CHANNEL_OK' as const });
    });
    const controller = new ActivityChannelValidationController(makeConfig(), {
      validateActivityPublishChannel: validate,
    } as never);

    const response = await controller.validate(
      { guildId: 'g1', channelIds: ['ok', 'missing', 'wrong', 'ok'] },
      'proj-secret',
    );

    expect(response.results).toEqual([
      { channelId: 'ok', ok: true, code: 'CHANNEL_OK' },
      { channelId: 'missing', ok: false, code: 'CHANNEL_MISSING' },
      {
        channelId: 'wrong',
        ok: false,
        code: 'CHANNEL_WRONG_GUILD',
        detail: 'guild g1',
      },
    ]);
    expect(validate).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid projection secret', async () => {
    const controller = new ActivityChannelValidationController(makeConfig(), {
      validateActivityPublishChannel: vi.fn(),
    } as never);
    await expect(
      controller.validate({ guildId: 'g1', channelIds: ['c1'] }, 'wrong'),
    ).rejects.toThrow(/Invalid projection secret|Unauthorized/i);
  });
});
