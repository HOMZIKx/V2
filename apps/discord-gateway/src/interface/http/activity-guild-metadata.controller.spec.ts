import { describe, expect, it, vi } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { ActivityGuildMetadataController } from './activity-guild-metadata.controller.js';

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

function gatewayStub() {
  return {
    listGuildPresentations: vi.fn(() => [{ id: 'g1', name: 'Destiny' }]),
    getGuildPresentation: vi.fn(() => Promise.resolve({ id: 'g1', name: 'Destiny' })),
    listGuildChannelsForAdmin: vi.fn(() =>
      Promise.resolve([{ id: 'c1', name: 'centrum-aktywnosci', type: 0, usable: true }]),
    ),
    listGuildRolesForAdmin: vi.fn(() =>
      Promise.resolve([{ id: 'r1', name: 'Smok', managed: false, everyone: false }]),
    ),
    resolveMemberDisplays: vi.fn(() => Promise.resolve([{ id: 'u1', displayName: 'Azrael' }])),
  };
}

describe('ActivityGuildMetadataController', () => {
  it('rejects an invalid projection secret', async () => {
    const controller = new ActivityGuildMetadataController(
      makeConfig(),
      gatewayStub() as never,
      null,
    );
    await expect(controller.listGuilds('wrong')).rejects.toThrow(
      /Invalid projection secret|Unauthorized/i,
    );
  });

  it('returns human-readable guild, channel and role metadata', async () => {
    const gateway = gatewayStub();
    const controller = new ActivityGuildMetadataController(makeConfig(), gateway as never, null);
    await expect(controller.listGuilds('proj-secret')).resolves.toEqual({
      guilds: [{ id: 'g1', name: 'Destiny' }],
    });
    await expect(controller.listChannels('g1', 'proj-secret')).resolves.toEqual({
      channels: [{ id: 'c1', name: 'centrum-aktywnosci', type: 0, usable: true }],
    });
    await expect(controller.listRoles('g1', 'proj-secret')).resolves.toEqual({
      roles: [{ id: 'r1', name: 'Smok', managed: false, everyone: false }],
    });
  });
});
