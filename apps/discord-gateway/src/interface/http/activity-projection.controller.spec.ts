import { describe, expect, it, vi } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { ActivityProjectionController } from './activity-projection.controller.js';

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

function gatewayForDeliver(
  overrides: {
    publish?: ReturnType<typeof vi.fn>;
    validate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    publishComponentsV2Message:
      overrides.publish ?? vi.fn(() => Promise.resolve({ messageId: 'm1', channelId: 'c1' })),
    editComponentsV2Message: vi.fn(),
    validateActivityPublishChannel:
      overrides.validate ?? vi.fn(() => Promise.resolve({ ok: true, code: 'CHANNEL_OK' as const })),
  };
}

const hubBody = {
  outboxId: 'outbox-1',
  eventType: 'activity.panel.projection_repaired.v1',
  aggregateId: 'panel-1',
  aggregateVersion: 1,
  payload: {
    kind: 'hub' as const,
    channelId: 'c1',
    opaquePanelId: 'a1b2c3d4e5f6',
  },
};

describe('ActivityProjectionController', () => {
  it('delivers hub projection idempotently', async () => {
    const publish = vi.fn(() => Promise.resolve({ messageId: 'm1', channelId: 'c1' }));
    const controller = new ActivityProjectionController(
      makeConfig(),
      gatewayForDeliver({ publish }) as never,
    );

    const first = await controller.deliver(hubBody, 'proj-secret');
    expect(first.status).toBe('delivered');
    expect(first.messageId).toBe('m1');
    expect(publish).toHaveBeenCalledOnce();

    const second = await controller.deliver(hubBody, 'proj-secret');
    expect(second.status).toBe('duplicate');
    expect(publish).toHaveBeenCalledOnce();
  });

  it('rejects missing projection secret when configured', async () => {
    const controller = new ActivityProjectionController(makeConfig(), gatewayForDeliver() as never);
    await expect(
      controller.deliver(
        {
          outboxId: 'x',
          eventType: 'activity.activity.created.v1',
          aggregateId: 'a',
          aggregateVersion: 1,
          payload: {},
        },
        'wrong',
      ),
    ).rejects.toThrow(/Invalid projection secret|Unauthorized/i);
  });

  it('rejects deliver without projection secret', async () => {
    const controller = new ActivityProjectionController(makeConfig(), gatewayForDeliver() as never);
    await expect(
      controller.deliver(
        {
          outboxId: 'x2',
          eventType: 'activity.activity.created.v1',
          aggregateId: 'a',
          aggregateVersion: 1,
          payload: {},
        },
        undefined,
      ),
    ).rejects.toThrow(/Invalid projection secret|Unauthorized/i);
  });

  it('rejects Discord activity config without projection secret (fail fast at boot)', () => {
    expect(() => makeConfig({ ACTIVITY_PROJECTION_SHARED_SECRET: '' })).toThrow(
      /ACTIVITY_PROJECTION_SHARED_SECRET/,
    );
  });

  it('accepts deliver with correct projection secret', async () => {
    const publish = vi.fn(() => Promise.resolve({ messageId: 'm-ok', channelId: 'c1' }));
    const controller = new ActivityProjectionController(
      makeConfig(),
      gatewayForDeliver({ publish }) as never,
    );
    const result = await controller.deliver({ ...hubBody, outboxId: 'ok-1' }, 'proj-secret');
    expect(result.status).toBe('delivered');
    expect(publish).toHaveBeenCalledOnce();
  });

  it('rejects a malformed projection payload', async () => {
    const controller = new ActivityProjectionController(makeConfig(), gatewayForDeliver() as never);
    await expect(
      controller.deliver(
        {
          outboxId: 'bad',
          eventType: 'activity.activity.created.v1',
          aggregateId: 'a',
          aggregateVersion: 1,
          payload: { kind: 'hub', channelId: 'c1' },
        },
        'proj-secret',
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { status: 'rejected', detail: 'Invalid projection payload.' },
    });
  });

  it('does not publish when the channel is outside the allowed guild', async () => {
    const publish = vi.fn(() => Promise.resolve({ messageId: 'm1', channelId: 'c-other' }));
    const controller = new ActivityProjectionController(
      makeConfig(),
      gatewayForDeliver({
        publish,
        validate: vi.fn(() => Promise.resolve({ ok: false, code: 'CHANNEL_WRONG_GUILD' as const })),
      }) as never,
    );
    await expect(
      controller.deliver({ ...hubBody, outboxId: 'wrong-guild' }, 'proj-secret'),
    ).rejects.toMatchObject({
      status: 403,
      response: { status: 'rejected', detail: 'Channel is outside the allowed guild.' },
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish a DM or unsupported channel', async () => {
    const publish = vi.fn();
    const controller = new ActivityProjectionController(
      makeConfig(),
      gatewayForDeliver({
        publish,
        validate: vi.fn(() => Promise.resolve({ ok: false, code: 'CHANNEL_UNSUPPORTED' as const })),
      }) as never,
    );
    await expect(
      controller.deliver({ ...hubBody, outboxId: 'dm-1' }, 'proj-secret'),
    ).rejects.toMatchObject({
      status: 400,
      response: { status: 'rejected', detail: 'Channel type is not allowed.' },
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish when bot permissions are missing', async () => {
    const publish = vi.fn();
    const controller = new ActivityProjectionController(
      makeConfig(),
      gatewayForDeliver({
        publish,
        validate: vi.fn(() =>
          Promise.resolve({ ok: false, code: 'BOT_PERMISSION_MISSING' as const }),
        ),
      }) as never,
    );
    await expect(
      controller.deliver({ ...hubBody, outboxId: 'no-perms' }, 'proj-secret'),
    ).rejects.toMatchObject({
      status: 403,
      response: { status: 'rejected', detail: 'Bot is missing required channel permissions.' },
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects a payload guild outside the configured P4 guild', async () => {
    const publish = vi.fn();
    const controller = new ActivityProjectionController(
      makeConfig(),
      gatewayForDeliver({ publish }) as never,
    );
    await expect(
      controller.deliver(
        {
          ...hubBody,
          outboxId: 'other-guild',
          payload: { ...hubBody.payload, guildId: '999' },
        },
        'proj-secret',
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { status: 'rejected', detail: 'Guild is outside the allowed P4 scope.' },
    });
    expect(publish).not.toHaveBeenCalled();
  });
});
