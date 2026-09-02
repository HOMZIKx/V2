import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import {
  createDraftCustomId,
  createModalCustomId,
  createPanelCustomId,
} from '../../infrastructure/security/activity-signed-custom-id.js';
import { DraftUiStateCache } from '../../presentation/discord/draft-ui-state-cache.js';
import { formatPolishLocalDateTime } from '../../presentation/discord/localized-datetime.js';
import { ActivityInteractionHandler } from './activity-interaction-handler.js';

const secret = 's'.repeat(32);
const guildId = '1534228693017432124';
const channelId = '222222222222222222';
const operatorId = '111111111111111111';
const opaquePanel = 'a1b2c3d4e5f6';
const panelId = '33333333-4444-5555-6666-777777777777';

/** Stable future wall-clock within the 14-day schedule horizon (Europe/Warsaw). */
function futureScheduleFromDisplay(): string {
  return formatPolishLocalDateTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
}

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
      ACTIVITY_PROJECTION_SHARED_SECRET: 'proj-secret',
      ACTIVITY_CLIENT_MODE: 'headers',
      ACTIVITY_ENABLED: 'false',
    }),
  );
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeOperatorCommand(overrides: Record<string, unknown> = {}) {
  return {
    commandName: 'centrum-panel',
    guildId,
    channelId,
    user: { id: operatorId },
    memberPermissions: { bitfield: 8n },
    deferReply: vi.fn(() => Promise.resolve(undefined)),
    editReply: vi.fn(() => Promise.resolve(undefined)),
    reply: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };
}

describe('ActivityInteractionHandler hub recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adopts existing message on publish without creating a new one', async () => {
    const upsertHubProjectionPanel = vi
      .fn()
      .mockResolvedValueOnce({
        id: panelId,
        opaqueId: opaquePanel,
        messageId: null,
        channelId,
      })
      .mockResolvedValueOnce({
        id: panelId,
        opaqueId: opaquePanel,
        messageId: 'msg-adopt',
        channelId,
      });
    const activityClient = {
      listHubProjectionPanels: vi.fn(() => Promise.resolve([])),
      getHubProjectionPendingOccurrence: vi.fn(() => Promise.resolve(null)),
      upsertHubProjectionPanel,
    };
    const gateway = {
      fetchChannelMessage: vi.fn(),
      findBotMessagesWithPanelOpaqueId: vi.fn(() =>
        Promise.resolve([{ messageId: 'msg-adopt', channelId }]),
      ),
      editComponentsV2Message: vi.fn(() => Promise.resolve(undefined)),
      publishComponentsV2Message: vi.fn(),
      deleteChannelMessage: vi.fn(),
    };
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: gateway as never,
      activityClient: activityClient as never,
      logger: createLogger(),
    });

    await handler.handleCommand(makeOperatorCommand() as never);

    expect(gateway.publishComponentsV2Message).not.toHaveBeenCalled();
    expect(gateway.editComponentsV2Message).toHaveBeenCalledWith(
      channelId,
      'msg-adopt',
      expect.objectContaining({ flags: expect.any(Number) as number }),
    );
    expect(upsertHubProjectionPanel).toHaveBeenCalledTimes(2);
    expect(upsertHubProjectionPanel.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        messageId: 'msg-adopt',
        status: 'active',
        occurrenceOutcome: 'adopted',
      }),
    );
  });

  it('reconcile adopts scanned message instead of telling operator to re-publish', async () => {
    const upsertHubProjectionPanel = vi
      .fn()
      .mockResolvedValueOnce({
        id: panelId,
        opaqueId: opaquePanel,
        messageId: null,
        channelId,
      })
      .mockResolvedValueOnce({
        id: panelId,
        opaqueId: opaquePanel,
        messageId: 'msg-reconcile',
        channelId,
      });
    const activityClient = {
      listHubProjectionPanels: vi.fn(() =>
        Promise.resolve([{ id: panelId, opaqueId: opaquePanel, panelType: 'hub', channelId }]),
      ),
      getHubProjectionPendingOccurrence: vi.fn(() =>
        Promise.resolve({ operationId: 'op-crash', nonce: 'noncefrompendingocc1234' }),
      ),
      upsertHubProjectionPanel,
    };
    const gateway = {
      fetchChannelMessage: vi.fn(() => Promise.reject(new Error('Unknown Message'))),
      findBotMessagesWithPanelOpaqueId: vi.fn(() =>
        Promise.resolve([{ messageId: 'msg-reconcile', channelId }]),
      ),
      editComponentsV2Message: vi.fn(() => Promise.resolve(undefined)),
      publishComponentsV2Message: vi.fn(),
      deleteChannelMessage: vi.fn(),
    };
    const editReply = vi.fn(() => Promise.resolve(undefined));
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: gateway as never,
      activityClient: activityClient as never,
      logger: createLogger(),
    });

    await handler.handleCommand(
      makeOperatorCommand({ commandName: 'centrum-reconcile', editReply }) as never,
    );

    expect(gateway.publishComponentsV2Message).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('przyjęto istniejącą wiadomość') as unknown as string,
      }),
    );
    expect(upsertHubProjectionPanel.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ nonce: 'noncefrompendingocc1234' }),
    );
  });

  it('repairs with new publish when message deleted and scan finds nothing', async () => {
    const upsertHubProjectionPanel = vi
      .fn()
      .mockResolvedValueOnce({
        id: panelId,
        opaqueId: opaquePanel,
        messageId: 'msg-gone',
        channelId,
      })
      .mockResolvedValueOnce({
        id: panelId,
        opaqueId: opaquePanel,
        messageId: 'msg-new',
        channelId,
      });
    const activityClient = {
      listHubProjectionPanels: vi.fn(() =>
        Promise.resolve([
          {
            id: panelId,
            opaqueId: opaquePanel,
            panelType: 'hub',
            channelId,
            messageId: 'msg-gone',
          },
        ]),
      ),
      getHubProjectionPendingOccurrence: vi.fn(() => Promise.resolve(null)),
      upsertHubProjectionPanel,
    };
    const gateway = {
      fetchChannelMessage: vi.fn(() => Promise.reject(new Error('Unknown Message'))),
      findBotMessagesWithPanelOpaqueId: vi.fn(() => Promise.resolve([])),
      editComponentsV2Message: vi.fn(),
      publishComponentsV2Message: vi.fn(() => Promise.resolve({ messageId: 'msg-new', channelId })),
      deleteChannelMessage: vi.fn(),
    };
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: gateway as never,
      activityClient: activityClient as never,
      logger: createLogger(),
    });

    await handler.handleCommand(makeOperatorCommand({ commandName: 'centrum-reconcile' }) as never);

    expect(gateway.publishComponentsV2Message).toHaveBeenCalledOnce();
    expect(upsertHubProjectionPanel.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ messageId: 'msg-new', occurrenceOutcome: 'sent' }),
    );
  });
});

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
    expect(createDraft).not.toHaveBeenCalled();
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
      { statusDefId: statusId, guildId },
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

  it('rejects forged modal custom id without valid signature', async () => {
    const logger = createLogger();
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { updateDraft: vi.fn() } as never,
      logger,
    });
    const reply = vi.fn(() => Promise.resolve(undefined));
    const handled = await handler.handleModal({
      customId: 'activity:v1:modal:deadbeefcafe:create:invalidsig12',
      user: { id: operatorId },
      reply,
      deferred: false,
      replied: false,
      fields: { getTextInputValue: vi.fn(), getStringSelectValues: vi.fn(() => ['exact']) },
    } as never);
    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Nieprawidłowy') as unknown as string,
      }),
    );
  });

  it('does not log ActivityHttpError response bodies', async () => {
    const logger = createLogger();
    const { ActivityHttpError } =
      await import('../../infrastructure/activity/activity-http-client.js');
    const { createEventCustomId } =
      await import('../../infrastructure/security/activity-signed-custom-id.js');
    const sensitiveBody = JSON.stringify({ code: 'SECRET', detail: 'super-secret-token-xyz' });
    const activityClient = {
      lookupActivityByOpaque: vi.fn(() =>
        Promise.reject(new ActivityHttpError('fail', 'HTTP', 403, sensitiveBody)),
      ),
    };
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: activityClient as never,
      logger,
    });
    const customId = createEventCustomId('f6e5d4c3b2a1', 'participants', secret);
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId,
      guildId,
      user: { id: operatorId },
      id: 'interaction-log-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      deferReply: vi.fn(() => Promise.resolve(undefined)),
      editReply,
      reply: vi.fn(),
      showModal: vi.fn(),
    } as never);
    expect(logger.error).toHaveBeenCalled();
    const logPayload = JSON.stringify(logger.error.mock.calls);
    expect(logPayload).not.toContain('super-secret-token-xyz');
    expect(logPayload).not.toContain('SECRET');
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
        ACTIVITY_PROJECTION_SHARED_SECRET: 'proj-secret',
        ACTIVITY_CLIENT_MODE: 'headers',
        ACTIVITY_ENABLED: 'false',
      }),
    );
    const handler = new ActivityInteractionHandler({
      config,
      gateway: {} as never,
      activityClient: { upsertHubProjectionPanel: vi.fn() } as never,
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

const draftUuid = 'aabbccdd-eeff-4011-8222-334455667788';
const opaqueDraft = 'aabbccddeeff';

function modalFieldValue(modal: { toJSON: () => unknown }, customId: string): string | undefined {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.custom_id === customId && typeof rec.value === 'string') {
      found.push(rec.value);
    }
    for (const value of Object.values(rec)) {
      walk(value);
    }
  };
  walk(modal.toJSON());
  return found[0];
}

function makeFormFields(values: {
  name: string;
  description: string;
  from?: string;
  to?: string;
  when?: string;
}) {
  return {
    getTextInputValue: vi.fn((id: string) => {
      if (id === 'name') return values.name;
      if (id === 'description') return values.description;
      if (id === 'schedule_from') return values.from ?? futureScheduleFromDisplay();
      if (id === 'schedule_to') return values.to ?? '';
      return '';
    }),
    getStringSelectValues: vi.fn((id: string) =>
      id === 'when_kind' ? [values.when ?? 'exact'] : [],
    ),
  };
}

describe('ActivityInteractionHandler draft preview / edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create modal submit ACKs before delayed backend and yields one preview', async () => {
    const order: string[] = [];
    let releaseCreate!: () => void;
    let releaseUpdate!: () => void;
    const createDraft = vi.fn(
      () =>
        new Promise<{ id: string; payload: Record<string, unknown> }>((resolve) => {
          order.push('http');
          releaseCreate = () => resolve({ id: draftUuid, payload: {} });
        }),
    );
    const updateDraft = vi.fn(
      (_id: string, body: { payload: Record<string, unknown> }) =>
        new Promise<{ id: string; payload: Record<string, unknown> }>((resolve) => {
          releaseUpdate = () => resolve({ id: draftUuid, payload: body.payload });
        }),
    );
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { createDraft, updateDraft } as never,
      logger: createLogger(),
    });
    const deferReply = vi.fn(() => {
      order.push('ack');
      return Promise.resolve();
    });
    const deferUpdate = vi.fn();
    const editReply = vi.fn(() => Promise.resolve(undefined));
    const reply = vi.fn();
    const pending = handler.handleModal({
      customId: createModalCustomId('create', opaquePanel, secret),
      guildId,
      user: { id: operatorId },
      id: 'modal-create-1',
      message: { components: [] },
      deferred: false,
      replied: false,
      deferReply,
      deferUpdate,
      editReply,
      reply,
      fields: makeFormFields({ name: 'Azrael', description: 'Klucz' }),
    } as never);

    await vi.waitFor(() => {
      expect(deferReply).toHaveBeenCalledOnce();
    });
    expect(order[0]).toBe('ack');
    expect(editReply).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(createDraft).toHaveBeenCalledOnce();
    });
    releaseCreate();
    await vi.waitFor(() => {
      expect(updateDraft).toHaveBeenCalled();
    });
    releaseUpdate();
    await pending;

    expect(deferUpdate).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledOnce();
    expect(JSON.stringify((editReply.mock.calls[0] as unknown as [unknown])[0])).toContain(
      'Edytuj',
    );
  });

  it('edit modal submit updates the same preview and does not stack a new ephemeral', async () => {
    const { renderDraftFormSummary } =
      await import('../../presentation/discord/activity-ephemeral-renderer.js');
    const existingPayload = {
      name: 'A',
      description: 'B',
      scheduleFromDisplay: futureScheduleFromDisplay(),
      scheduleKind: 'exact',
      source: 'create',
      extraKeep: 'stay',
    };
    const preview = renderDraftFormSummary({
      opaqueDraftId: opaqueDraft,
      signingSecret: secret,
      title: 'A',
      lines: ['**A**', 'Kiedy: 20 sierpnia', 'Opis: B'],
    });
    const order: string[] = [];
    let releaseLookup!: () => void;
    let releaseUpdate!: () => void;
    const lookupDraftByOpaque = vi.fn(
      () =>
        new Promise<{ id: string; payload: Record<string, unknown> }>((resolve) => {
          order.push('http');
          releaseLookup = () => resolve({ id: draftUuid, payload: existingPayload });
        }),
    );
    const updateDraft = vi.fn(
      (_id: string, body: { payload: Record<string, unknown> }) =>
        new Promise<{ id: string; payload: Record<string, unknown> }>((resolve) => {
          releaseUpdate = () => resolve({ id: draftUuid, payload: body.payload });
        }),
    );
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque, updateDraft } as never,
      logger: createLogger(),
    });
    const deferUpdate = vi.fn(() => {
      order.push('ack');
      return Promise.resolve();
    });
    const deferReply = vi.fn();
    const editReply = vi.fn(() => Promise.resolve(undefined));
    const reply = vi.fn();
    const pending = handler.handleModal({
      customId: createModalCustomId('edit', opaqueDraft, secret),
      guildId,
      user: { id: operatorId },
      id: 'modal-edit-1',
      message: { components: preview.components },
      deferred: false,
      replied: false,
      deferReply,
      deferUpdate,
      editReply,
      reply,
      fields: makeFormFields({ name: 'D', description: 'B' }),
    } as never);

    await vi.waitFor(() => {
      expect(deferUpdate).toHaveBeenCalledOnce();
    });
    expect(order[0]).toBe('ack');
    expect(editReply).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(lookupDraftByOpaque).toHaveBeenCalledOnce();
    });
    releaseLookup();
    await vi.waitFor(() => {
      expect(updateDraft).toHaveBeenCalled();
    });
    releaseUpdate();
    await pending;

    expect(deferReply).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledOnce();
    const sent = updateDraft.mock.calls[0]?.[1] as { payload: Record<string, unknown> };
    expect(sent.payload.name).toBe('D');
    expect(sent.payload.description).toBe('B');
    expect(sent.payload.extraKeep).toBe('stay');
    const previewJson = JSON.stringify((editReply.mock.calls[0] as unknown as [unknown])[0]);
    expect(previewJson).not.toContain('v2dui.v1');
    expect(previewJson).not.toContain('scheduleFromDisplay');

    const showModal = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: operatorId },
      id: 'edit-after-submit-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: preview.components },
      showModal,
      deferReply: vi.fn(),
      deferUpdate: vi.fn(),
      reply: vi.fn(),
    } as never);
    expect(showModal).toHaveBeenCalledOnce();
    expect(lookupDraftByOpaque).toHaveBeenCalledTimes(1);
  });

  it('second edit still updates in place without a new reply', async () => {
    const { renderDraftFormSummary } =
      await import('../../presentation/discord/activity-ephemeral-renderer.js');
    const preview = renderDraftFormSummary({
      opaqueDraftId: opaqueDraft,
      signingSecret: secret,
      title: 'D',
      lines: ['**D**'],
    });
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: {
        lookupDraftByOpaque: vi.fn(() =>
          Promise.resolve({
            id: draftUuid,
            payload: { name: 'D', description: 'B', extraKeep: 'stay' },
          }),
        ),
        updateDraft: vi.fn((_id: string, body: { payload: Record<string, unknown> }) =>
          Promise.resolve({ id: draftUuid, payload: body.payload }),
        ),
      } as never,
      logger: createLogger(),
    });
    const deferReply = vi.fn();
    const reply = vi.fn();
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleModal({
      customId: createModalCustomId('edit', opaqueDraft, secret),
      guildId,
      user: { id: operatorId },
      id: 'modal-edit-2',
      message: { components: preview.components },
      deferReply,
      deferUpdate: vi.fn(() => Promise.resolve(undefined)),
      editReply,
      reply,
      fields: makeFormFields({ name: 'E', description: 'B' }),
    } as never);
    expect(deferReply).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledOnce();
  });

  const cachedFormState = {
    name: 'A',
    description: 'B',
    scheduleFromDisplay: 'C',
    scheduleToDisplay: '',
    whenKind: 'exact' as const,
    source: 'create' as const,
  };

  it('opens edit modal from cache hit before any HTTP', async () => {
    const { renderDraftFormSummary } =
      await import('../../presentation/discord/activity-ephemeral-renderer.js');
    const preview = renderDraftFormSummary({
      opaqueDraftId: opaqueDraft,
      signingSecret: secret,
      title: 'A',
      lines: ['**A**', 'Opis: B'],
    });
    const cache = new DraftUiStateCache();
    cache.set({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }, cachedFormState);
    const lookupDraftByOpaque = vi.fn();
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    const showModal = vi.fn(() => Promise.resolve(undefined));
    const deferUpdate = vi.fn();
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: operatorId },
      id: 'edit-click-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: preview.components },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      reply: vi.fn(),
    } as never);
    expect(lookupDraftByOpaque).not.toHaveBeenCalled();
    expect(deferUpdate).not.toHaveBeenCalled();
    expect(showModal).toHaveBeenCalledOnce();
    const firstModalCall = showModal.mock.calls[0] as unknown as
      [{ toJSON: () => unknown }] | undefined;
    expect(firstModalCall).toBeDefined();
    if (firstModalCall === undefined) {
      throw new Error('expected showModal to receive a modal');
    }
    const modal = firstModalCall[0];
    expect(modalFieldValue(modal, 'name')).toBe('A');
    expect(modalFieldValue(modal, 'description')).toBe('B');
    expect(modalFieldValue(modal, 'schedule_from')).toBe('C');
  });

  it('does not let another user open a cached modal and ACKs before HTTP on miss', async () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }, cachedFormState);
    const order: string[] = [];
    const lookupDraftByOpaque = vi.fn(() => {
      order.push('http');
      return Promise.resolve({
        id: draftUuid,
        payload: { name: 'A', description: 'B', scheduleFromDisplay: 'C', scheduleKind: 'exact' },
      });
    });
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    const showModal = vi.fn();
    const deferUpdate = vi.fn(() => {
      order.push('ack');
      return Promise.resolve();
    });
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: '999999999999999999' },
      id: 'edit-other-user-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      editReply,
      reply: vi.fn(),
    } as never);
    expect(showModal).not.toHaveBeenCalled();
    expect(order[0]).toBe('ack');
    expect(lookupDraftByOpaque).toHaveBeenCalled();
  });

  it('does not reuse cache across guilds', async () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }, cachedFormState);
    const lookupDraftByOpaque = vi.fn(() =>
      Promise.resolve({
        id: draftUuid,
        payload: { name: 'A', description: 'B', scheduleFromDisplay: 'C', scheduleKind: 'exact' },
      }),
    );
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    const showModal = vi.fn();
    const deferUpdate = vi.fn(() => Promise.resolve());
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId: '999000999000999000',
      user: { id: operatorId },
      id: 'edit-other-guild-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      editReply: vi.fn(() => Promise.resolve(undefined)),
      reply: vi.fn(),
    } as never);
    expect(showModal).not.toHaveBeenCalled();
    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(lookupDraftByOpaque).toHaveBeenCalled();
  });

  it('on cache miss defers immediately, updates the same preview, then opens modal on second click', async () => {
    const { renderDraftFormSummary } =
      await import('../../presentation/discord/activity-ephemeral-renderer.js');
    const preview = renderDraftFormSummary({
      opaqueDraftId: opaqueDraft,
      signingSecret: secret,
      title: 'A',
      lines: ['**A**', 'Opis: B'],
    });
    const order: string[] = [];
    const lookupDraftByOpaque = vi.fn(() => {
      order.push('http');
      return Promise.resolve({
        id: draftUuid,
        payload: { name: 'A', description: 'B', scheduleFromDisplay: 'C', scheduleKind: 'exact' },
      });
    });
    const cache = new DraftUiStateCache();
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    const showModal = vi.fn(() => Promise.resolve(undefined));
    const deferUpdate = vi.fn(() => {
      order.push('ack');
      return Promise.resolve();
    });
    const editReply = vi.fn(() => Promise.resolve(undefined));
    const reply = vi.fn();
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: operatorId },
      id: 'edit-miss-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: preview.components },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      editReply,
      reply,
    } as never);
    expect(showModal).not.toHaveBeenCalled();
    expect(order[0]).toBe('ack');
    expect(lookupDraftByOpaque).toHaveBeenCalledOnce();
    expect(reply).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledOnce();
    const refreshed = JSON.stringify((editReply.mock.calls[0] as unknown as [unknown])[0]);
    expect(refreshed).toContain('Edytuj');
    expect(refreshed).toContain('Dane formularza zostały odświeżone');
    expect(refreshed).toContain('Kliknij Edytuj ponownie');
    expect(refreshed).not.toContain('v2dui.v1');

    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: operatorId },
      id: 'edit-hit-2',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: preview.components },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      editReply,
      reply,
    } as never);
    expect(lookupDraftByOpaque).toHaveBeenCalledOnce();
    expect(showModal).toHaveBeenCalledOnce();
    const firstModalCall = showModal.mock.calls[0] as unknown as
      [{ toJSON: () => unknown }] | undefined;
    expect(firstModalCall).toBeDefined();
    if (firstModalCall === undefined) {
      throw new Error('expected showModal to receive a modal');
    }
    expect(modalFieldValue(firstModalCall[0], 'name')).toBe('A');
  });

  it('ignores forged v2dui tokens in preview copy and still fail-closes unsigned custom ids', async () => {
    const order: string[] = [];
    const lookupDraftByOpaque = vi.fn(() => {
      order.push('http');
      return Promise.resolve({
        id: draftUuid,
        payload: { name: 'A', description: 'B', scheduleFromDisplay: 'C', scheduleKind: 'exact' },
      });
    });
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque } as never,
      logger: createLogger(),
    });
    const showModal = vi.fn();
    const deferUpdate = vi.fn(() => {
      order.push('ack');
      return Promise.resolve();
    });
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: operatorId },
      id: 'edit-forged-token-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: {
        components: [
          {
            content: 'v2dui.v1.forgedsig.eyJuYW1lIjoiWCJ9',
            custom_id: `activity:v1:draft:${opaqueDraft}:edit:x`,
          },
        ],
      },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      editReply,
      reply: vi.fn(),
    } as never);
    expect(showModal).not.toHaveBeenCalled();
    expect(order[0]).toBe('ack');
    expect(lookupDraftByOpaque).toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledOnce();

    const reply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId: `activity:v1:draft:${opaqueDraft}:edit:forged`,
      guildId,
      user: { id: operatorId },
      id: 'edit-forged-custom-id-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal,
      deferReply: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      reply,
    } as never);
    expect(reply).toHaveBeenCalledOnce();
    expect(showModal).not.toHaveBeenCalled();
  });

  it('clears draft UI cache after successful discard and does not reopen from cache', async () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }, cachedFormState);
    const lookupDraftByOpaque = vi.fn(() =>
      Promise.resolve({
        id: draftUuid,
        payload: { name: 'A', description: 'B', scheduleFromDisplay: 'C', scheduleKind: 'exact' },
      }),
    );
    const discardDraft = vi.fn(() => Promise.resolve(undefined));
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque, discardDraft } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'discard', secret),
      guildId,
      user: { id: operatorId },
      id: 'discard-ok-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal: vi.fn(),
      deferReply: vi.fn(() => Promise.resolve()),
      deferUpdate: vi.fn(),
      editReply,
      reply: vi.fn(),
    } as never);
    expect(discardDraft).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith({ content: 'Szkic odrzucony.' });
    expect(
      cache.get({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }),
    ).toBeNull();

    const showModal = vi.fn();
    const deferUpdate = vi.fn(() => Promise.resolve());
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'edit', secret),
      guildId,
      user: { id: operatorId },
      id: 'edit-after-discard-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal,
      deferReply: vi.fn(),
      deferUpdate,
      editReply: vi.fn(() => Promise.resolve()),
      reply: vi.fn(),
    } as never);
    expect(showModal).not.toHaveBeenCalled();
    expect(deferUpdate).toHaveBeenCalledOnce();
  });

  it('does not clear draft UI cache when discard fails', async () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }, cachedFormState);
    const lookupDraftByOpaque = vi.fn(() =>
      Promise.resolve({
        id: draftUuid,
        payload: { name: 'A', description: 'B', scheduleFromDisplay: 'C', scheduleKind: 'exact' },
      }),
    );
    const discardDraft = vi.fn(() => Promise.reject(new Error('backend down')));
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque, discardDraft } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'discard', secret),
      guildId,
      user: { id: operatorId },
      id: 'discard-fail-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal: vi.fn(),
      deferReply: vi.fn(() => Promise.resolve()),
      deferUpdate: vi.fn(),
      editReply,
      reply: vi.fn(),
    } as never);
    expect(discardDraft).toHaveBeenCalledOnce();
    expect(editReply).not.toHaveBeenCalledWith({ content: 'Szkic odrzucony.' });
    expect(cache.get({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft })).toEqual(
      cachedFormState,
    );
  });

  it('clears draft UI cache after successful terminal publish', async () => {
    const cache = new DraftUiStateCache();
    cache.set({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }, cachedFormState);
    const lookupDraftByOpaque = vi.fn(() =>
      Promise.resolve({
        id: draftUuid,
        payload: {
          name: 'Azrael',
          startAt: '2026-08-20T18:00:00.000Z',
          scheduleKind: 'exact',
        },
      }),
    );
    const publishDraft = vi.fn(() => Promise.resolve({ name: 'Azrael' }));
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: { lookupDraftByOpaque, publishDraft } as never,
      logger: createLogger(),
      draftUiStateCache: cache,
    });
    await handler.handleComponent({
      customId: createDraftCustomId(opaqueDraft, 'publish', secret),
      guildId,
      channelId,
      user: { id: operatorId },
      id: 'publish-ok-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { components: [] },
      showModal: vi.fn(),
      deferReply: vi.fn(() => Promise.resolve()),
      deferUpdate: vi.fn(),
      editReply: vi.fn(() => Promise.resolve()),
      reply: vi.fn(),
    } as never);
    expect(publishDraft).toHaveBeenCalledOnce();
    expect(
      cache.get({ guildId, discordUserId: operatorId, opaqueDraftId: opaqueDraft }),
    ).toBeNull();
  });
});

describe('ActivityInteractionHandler LFG wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens LFG wizard instead of modal for panel lfg action', async () => {
    const identityClient = {
      getProfile: vi.fn(() =>
        Promise.resolve({
          userId: 'u1',
          displayName: 'Tester',
          activeCharacterId: 'char-1',
          characters: [
            {
              id: 'char-1',
              nickname: 'Main',
              classSpecKey: 'warrior_body',
              partyRoles: ['TANK', 'DPS'],
              isDefault: true,
            },
          ],
          interestKeys: [],
        }),
      ),
    };
    const handler = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: {} as never,
      identityClient: identityClient as never,
      logger: createLogger(),
    });

    const showModal = vi.fn();
    const deferReply = vi.fn(() => Promise.resolve(undefined));
    const editReply = vi.fn(() => Promise.resolve(undefined));
    const interaction = {
      customId: createPanelCustomId(opaquePanel, 'lfg', secret),
      guildId,
      user: { id: operatorId },
      id: 'lfg-open-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      showModal,
      deferReply,
      editReply,
      reply: vi.fn(),
    };

    const handled = await handler.handleComponent(interaction as never);
    expect(handled).toBe(true);
    expect(showModal).not.toHaveBeenCalled();
    expect(deferReply).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledOnce();
    expect(identityClient.getProfile).toHaveBeenCalledWith({ discordUserId: operatorId });
  });

  it('handles lfg join custom id with atomic joinLfg call', async () => {
    const joinLfg = vi.fn(() => Promise.resolve({ joined: true, waitlistPosition: null }));
    const activityClient = {
      joinLfg,
      searchLfg: vi.fn(),
      listLfgWatches: vi.fn(),
      getGuildConfig: vi.fn(() =>
        Promise.resolve({
          statuses: [
            {
              id: 'status-confirmed',
              active: true,
              selectableByMember: true,
              behavior: 'confirmed',
            },
          ],
        }),
      ),
    };
    const { createLfgCustomId } =
      await import('../../infrastructure/security/lfg-signed-custom-id.js');
    const activityOpaque = '111111222333';
    const customId = createLfgCustomId(opaquePanel, 'join', secret, activityOpaque);

    const lfgCache = new (
      await import('../../presentation/discord/lfg-ui-state-cache.js')
    ).LfgUiStateCache();
    lfgCache.set(
      { guildId, discordUserId: operatorId, opaquePanelId: opaquePanel },
      {
        screen: 'wizard',
        dungeonKey: 'azrael',
        characterId: 'char-1',
        characterLabel: 'Main',
        classSpecKey: 'warrior_body',
        classSpecLabel: 'Wojownik Ciało',
        characterSupportedRoles: ['TANK', 'DPS'],
        sessionRoles: ['TANK'],
        timePreset: 'now',
        showAllMatches: false,
        matches: [
          {
            activityId: '11111111-2222-3333-4444-555555555555',
            opaqueId: activityOpaque,
            dungeonLabel: 'Azrael',
            startAtLabel: '22.08.2026 18:00',
            occupancyLabel: '3/8',
            roleNeedSummary: 'Potrzeba: 1 × TANK',
            matchReason: 'Twoja rola pasuje',
          },
        ],
        similarGroupsWarning: null,
        viewedMatchOpaqueId: null,
        customWindow: null,
        pendingJoinRolePick: null,
        pendingQuickAdd: null,
        editingWatchId: null,
      },
    );

    const identityClient = {
      getProfile: vi.fn(() =>
        Promise.resolve({
          userId: 'u1',
          displayName: null,
          activeCharacterId: 'char-1',
          characters: [
            {
              id: 'char-1',
              nickname: 'Main',
              classSpecKey: 'warrior_body',
              partyRoles: ['TANK', 'DPS'],
              isDefault: true,
            },
          ],
          interestKeys: [],
        }),
      ),
    };

    const handlerWithCache = new ActivityInteractionHandler({
      config: makeConfig(),
      gateway: {} as never,
      activityClient: activityClient as never,
      identityClient: identityClient as never,
      logger: createLogger(),
      lfgUiStateCache: lfgCache,
    });

    const deferUpdate = vi.fn(() => Promise.resolve(undefined));
    const editReply = vi.fn(() => Promise.resolve(undefined));
    await handlerWithCache.handleComponent({
      customId,
      guildId,
      user: { id: operatorId },
      id: 'lfg-join-1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      message: { flags: { has: () => true }, components: [] },
      deferUpdate,
      deferReply: vi.fn(),
      editReply,
      reply: vi.fn(),
      showModal: vi.fn(),
    } as never);

    expect(joinLfg).toHaveBeenCalledOnce();
    expect(joinLfg).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: '11111111-2222-3333-4444-555555555555',
        statusDefId: 'status-confirmed',
        partyRoleKey: 'TANK',
        guildId,
        characterId: 'char-1',
      }),
      expect.objectContaining({ discordUserId: operatorId }),
    );
    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledOnce();
  });
});
