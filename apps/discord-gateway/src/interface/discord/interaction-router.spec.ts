import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetIdempotencyWindow } from '../../application/interactions/idempotency.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import {
  createSignedCustomId,
  panelPayload,
} from '../../infrastructure/security/signed-custom-id.js';
import { InteractionRouter } from './interaction-router.js';

const secret = 's'.repeat(32);
const guildId = '1534228693017432124';
const operatorId = '111111111111111111';

function makeConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '123456789012345678',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: guildId,
      DISCORD_TEST_OPERATOR_IDS: operatorId,
      DISCORD_COMPONENT_SIGNING_SECRET: secret,
    }),
  );
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function baseInteraction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'interaction-1',
    type: 2,
    guildId,
    channelId: '333333333333333333',
    user: { id: operatorId },
    memberPermissions: { bitfield: 0n },
    replied: false,
    deferred: false,
    isRepliable: () => true,
    isChatInputCommand: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    isStringSelectMenu: () => false,
    isButton: () => false,
    reply: vi.fn(() => Promise.resolve(undefined)),
    deferReply: vi.fn(() => Promise.resolve(undefined)),
    editReply: vi.fn(() => Promise.resolve(undefined)),
    followUp: vi.fn(() => Promise.resolve(undefined)),
    update: vi.fn(() => Promise.resolve(undefined)),
    showModal: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };
}

describe('InteractionRouter', () => {
  beforeEach(() => {
    resetIdempotencyWindow();
  });

  it('rejects foreign guild interactions', async () => {
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const interaction = baseInteraction({
      guildId: '999999999999999999',
      isChatInputCommand: () => true,
      commandName: 'status',
    });
    await router.handle(interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });

  it('handles /status as ephemeral deferred reply', async () => {
    const gateway = {
      getSnapshot: vi.fn(() => ({
        state: 'ready',
        uptimeSeconds: 10,
        pingMs: 20,
        commandsRegistered: true,
      })),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const interaction = baseInteraction({
      isChatInputCommand: () => true,
      commandName: 'status',
      user: { id: '999999999999999999' },
    });
    await router.handle(interaction as never);
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('denies /panel-test for non-operators', async () => {
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const interaction = baseInteraction({
      id: 'interaction-panel-deny',
      isChatInputCommand: () => true,
      commandName: 'panel-test',
      user: { id: '999999999999999999' },
    });
    await router.handle(interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/Brak uprawnień/) as unknown as string,
        flags: MessageFlags.Ephemeral,
      }),
    );
  });

  it('opens modal for form_test without logging field content', async () => {
    const logger = createLogger();
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger,
    });
    const interaction = baseInteraction({
      id: 'interaction-select',
      isMessageComponent: () => true,
      isStringSelectMenu: () => true,
      customId: createSignedCustomId('select', panelPayload(), secret),
      values: ['form_test'],
      message: { id: '444444444444444444' },
    });
    await router.handle(interaction as never);
    expect(interaction.showModal).toHaveBeenCalled();
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret notes');
  });

  it('confirms modal with length only', async () => {
    const logger = createLogger();
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger,
    });
    const notes = 'private modal content must not be logged';
    const interaction = baseInteraction({
      id: 'interaction-modal',
      isModalSubmit: () => true,
      customId: createSignedCustomId('modal', panelPayload(), secret),
      fields: {
        getTextInputValue: () => notes,
      },
    });
    await router.handle(interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(
          new RegExp(`Długość uwag: ${String(notes.length)}`),
        ) as unknown as string,
        flags: MessageFlags.Ephemeral,
      }),
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(notes);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(notes);
  });

  it('publishes /panel-test for operators when channel permissions are ok', async () => {
    const send = vi.fn(() => Promise.resolve(undefined));
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(() => Promise.resolve({ ok: true, missing: [] as string[] })),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const interaction = baseInteraction({
      id: 'interaction-panel-ok',
      isChatInputCommand: () => true,
      commandName: 'panel-test',
      channel: {
        isTextBased: () => true,
        isDMBased: () => false,
        send,
      },
    });
    await router.handle(interaction as never);
    expect(gateway.checkChannelPermissions).toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/opublikowany/) as unknown as string,
      }),
    );
  });

  it('refreshes panel for operators', async () => {
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const interaction = baseInteraction({
      id: 'interaction-refresh',
      isMessageComponent: () => true,
      isButton: () => true,
      customId: createSignedCustomId('refresh', panelPayload(), secret),
      message: { id: '444444444444444444' },
    });
    await router.handle(interaction as never);
    expect(interaction.update).toHaveBeenCalled();
  });

  it('asks for delete confirmation then cancels', async () => {
    const gateway = {
      getSnapshot: vi.fn(),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const ask = baseInteraction({
      id: 'interaction-delete-ask',
      isMessageComponent: () => true,
      isButton: () => true,
      customId: createSignedCustomId('delete_ask', panelPayload(), secret),
      message: { id: '444444444444444444' },
    });
    await router.handle(ask as never);
    expect(ask.reply).toHaveBeenCalled();

    const cancel = baseInteraction({
      id: 'interaction-delete-cancel',
      isMessageComponent: () => true,
      isButton: () => true,
      customId: createSignedCustomId(
        'delete_cancel',
        `${panelPayload()}m444444444444444444`,
        secret,
      ),
      message: { id: 'ephemeral-1' },
    });
    await router.handle(cancel as never);
    expect(cancel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/anulowane/) as unknown as string,
      }),
    );
  });

  it('blocks duplicate interaction ids', async () => {
    const gateway = {
      getSnapshot: vi.fn(() => ({
        state: 'ready',
        uptimeSeconds: 1,
        pingMs: 1,
        commandsRegistered: true,
      })),
      getState: vi.fn(() => 'ready'),
      checkChannelPermissions: vi.fn(),
    };
    const router = new InteractionRouter({
      config: makeConfig(),
      gateway: gateway as never,
      logger: createLogger(),
    });
    const first = baseInteraction({
      id: 'dup-1',
      isChatInputCommand: () => true,
      commandName: 'status',
    });
    const second = baseInteraction({
      id: 'dup-1',
      isChatInputCommand: () => true,
      commandName: 'status',
    });
    await router.handle(first as never);
    await router.handle(second as never);
    expect(second.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/już przetwarzana/) as unknown as string,
      }),
    );
  });
});
