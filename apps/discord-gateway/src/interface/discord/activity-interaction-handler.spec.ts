import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';
import { ActivityInteractionHandler } from './activity-interaction-handler.js';

const secret = 's'.repeat(32);
const guildId = '1534228693017432124';
const operatorId = '111111111111111111';
const opaquePanel = 'a1b2c3d4e5f6';

function makeConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: guildId,
      DISCORD_TEST_OPERATOR_IDS: operatorId,
      DISCORD_COMPONENT_SIGNING_SECRET: secret,
      DISCORD_ACTIVITY_ENABLED: 'true',
      ACTIVITY_ORGANIZATION_ID: 'org-test',
      ACTIVITY_CLIENT_MODE: 'headers',
      ACTIVITY_ENABLED: 'false',
    }),
  );
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('ActivityInteractionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens full create modal without sectional ephemeral first', async () => {
    const createDraft = vi.fn(() =>
      Promise.resolve({ id: '11111111-2222-3333-4444-555555555555', payload: {} }),
    );
    const activityClient = {
      createDraft,
    };
    const gateway = {
      publishComponentsV2Message: vi.fn(),
      editComponentsV2Message: vi.fn(),
      fetchChannelMessage: vi.fn(),
    };
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: gateway as never,
      activityClient: activityClient as never,
      logger: createLogger(),
    });

    const showModal = vi.fn(() => Promise.resolve(undefined));
    const deferReply = vi.fn(() => Promise.resolve(undefined));
    const reply = vi.fn(() => Promise.resolve(undefined));
    const interaction = {
      customId: createPanelCustomId(opaquePanel, 'create', secret),
      guildId,
      user: { id: operatorId },
      id: 'interaction-create-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      showModal,
      deferReply,
      reply,
      editReply: vi.fn(),
    };

    const handled = await handler.handleComponent(interaction as never);
    expect(handled).toBe(true);
    expect(createDraft).toHaveBeenCalledOnce();
    expect(showModal).toHaveBeenCalledOnce();
    expect(reply).not.toHaveBeenCalled();
    expect(deferReply).not.toHaveBeenCalled();
    const calls = showModal.mock.calls as unknown as Array<[{ toJSON: () => { title?: string } }]>;
    expect(calls[0]?.[0]?.toJSON().title).toBe('Utwórz aktywność');
  });

  it('resolves RSVP statusDefId from guild config opaque ids', async () => {
    const statusId = 'aabbccdd-eeff-4011-8222-334455667788';
    const statusOpaque = statusId.replace(/-/g, '').slice(0, 12);
    const activityClient = {
      lookupActivityByOpaque: vi.fn(() =>
        Promise.resolve({
          id: 'act-1',
          guildId,
          name: 'Raid',
        }),
      ),
      getGuildConfig: vi.fn(() =>
        Promise.resolve({
          statuses: [{ id: statusId, label: 'Będę', opaqueId: statusOpaque }],
        }),
      ),
      rsvp: vi.fn(() => Promise.resolve({ waitlistPosition: null })),
    };
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: activityClient as never,
      logger: createLogger(),
    });

    const { createEventCustomId } =
      await import('../../infrastructure/security/activity-signed-custom-id.js');
    const customId = createEventCustomId('f6e5d4c3b2a1', 'rsvp', secret, statusOpaque);
    const editReply = vi.fn(() => Promise.resolve(undefined));
    const interaction = {
      customId,
      guildId,
      user: { id: operatorId },
      id: 'interaction-rsvp-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      deferReply: vi.fn(() => Promise.resolve(undefined)),
      editReply,
      reply: vi.fn(),
      showModal: vi.fn(),
    };

    await handler.handleComponent(interaction as never);
    expect(activityClient.rsvp).toHaveBeenCalledWith(
      'act-1',
      { statusDefId: statusId },
      expect.objectContaining({ discordUserId: operatorId }),
    );
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Zapis') as unknown as string,
      }),
    );
  });

  it('ignores non-activity commands when feature enabled', async () => {
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: {} as never,
      logger: createLogger(),
    });
    const handled = await handler.handleCommand({
      commandName: 'status',
      reply: vi.fn(),
    } as never);
    expect(handled).toBe(false);
  });

  it('returns false for components when custom id is not activity', async () => {
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: {} as never,
      logger: createLogger(),
    });
    const handled = await handler.handleComponent({
      customId: 'v1:select:p1:deadbeef',
      isButton: () => true,
      isStringSelectMenu: () => false,
    } as never);
    expect(handled).toBe(false);
  });
});

describe('ActivityInteractionHandler flags', () => {
  it('uses ephemeral replies for denied operator publish', async () => {
    const config = normalizeDiscordConfig(
      DiscordGatewayConfigSchema.parse({
        DISCORD_ENABLED: 'true',
        DISCORD_APPLICATION_ID: '100000000000000001',
        DISCORD_TOKEN: 'discord-test-token-value-1234567890',
        DISCORD_TEST_GUILD_ID: guildId,
        DISCORD_TEST_OPERATOR_IDS: operatorId,
        DISCORD_COMPONENT_SIGNING_SECRET: secret,
        DISCORD_ACTIVITY_ENABLED: 'true',
        ACTIVITY_ORGANIZATION_ID: 'org-test',
        ACTIVITY_CLIENT_MODE: 'headers',
        ACTIVITY_ENABLED: 'false',
      }),
    );
    const handler = new ActivityInteractionHandler({
      config,
      gateway: {} as never,
      activityClient: { upsertPanel: vi.fn() } as never,
      logger: createLogger(),
    });
    const reply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleCommand({
      commandName: 'centrum-panel',
      user: { id: '999999999999999999' },
      memberPermissions: { bitfield: 0n },
      reply,
    } as never);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
  });
});
