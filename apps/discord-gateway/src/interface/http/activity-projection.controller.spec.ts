import { describe, expect, it, vi } from 'vitest';

import { ActivityProjectionDeliveryService } from '../../infrastructure/activity/activity-projection-delivery.service.js';
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

describe('ActivityProjectionController', () => {
  it('delivers hub projection idempotently', async () => {
    const publish = vi.fn(() =>
      Promise.resolve({
        messageId: 'm1',
        channelId: 'c1',
      }),
    );
    const gateway = {
      publishComponentsV2Message: publish,
      editComponentsV2Message: vi.fn(),
    };
    const config = makeConfig();
    const delivery = new ActivityProjectionDeliveryService(config, gateway as never);
    const controller = new ActivityProjectionController(config, delivery);

    const body = {
      outboxId: 'outbox-1',
      eventType: 'activity.panel.projection_repaired.v1',
      aggregateType: 'panel',
      aggregateId: 'panel-1',
      aggregateVersion: 1,
      payload: {
        kind: 'hub',
        channelId: 'c1',
        opaquePanelId: 'a1b2c3d4e5f6',
      },
    };

    const first = await controller.deliver(body, 'proj-secret');
    expect(first.status).toBe('delivered');
    expect(first.messageId).toBe('m1');
    expect(publish).toHaveBeenCalledOnce();

    const second = await controller.deliver(body, 'proj-secret');
    expect(second.status).toBe('duplicate');
    expect(publish).toHaveBeenCalledOnce();
  });

  it('rejects missing projection secret when configured', async () => {
    const config = makeConfig();
    const delivery = new ActivityProjectionDeliveryService(config, {
      publishComponentsV2Message: vi.fn(),
    } as never);
    const controller = new ActivityProjectionController(config, delivery);
    await expect(
      controller.deliver(
        {
          outboxId: 'x',
          eventType: 'activity.activity.created.v1',
          aggregateType: 'activity',
          aggregateId: 'a',
          aggregateVersion: 1,
          payload: {},
        },
        'wrong',
      ),
    ).rejects.toThrow(/Invalid projection secret|Unauthorized/i);
  });
});
