import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscordGatewayConfigSchema, normalizeDiscordConfig } from '../discord/discord-config.js';
import { NotificationDmDeliveryService } from './notification-dm-delivery.service.js';

const secret = 's'.repeat(32);

function makeConfig() {
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
      ACTIVITY_PROJECTION_SHARED_SECRET: 'proj-secret',
      ACTIVITY_CLIENT_MODE: 'headers',
      ACTIVITY_ENABLED: 'false',
    }),
  );
}

describe('NotificationDmDeliveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders LFG DM action buttons when deliveryActions are present', async () => {
    const sendDirectMessage = vi.fn<
      (
        userId: string,
        payload: { content: string; components?: unknown[] },
      ) => Promise<{ ok: boolean; messageId: string }>
    >(() => Promise.resolve({ ok: true, messageId: 'm1' }));
    const service = new NotificationDmDeliveryService(
      {
        sendDirectMessage,
      } as never,
      makeConfig(),
    );

    const result = await service.deliver(
      {
        inboxItemId: 'inbox-1',
        recipientDiscordUserId: '222222222222222222',
        title: 'Dopasowanie',
        body: 'Twoja rola pasuje.',
        notificationClass: 'DISCOVERY',
        kind: 'lfg.match',
        guildId: '1534228693017432124',
        deliveryActions: {
          template: 'lfg_match',
          activityId: '11111111-2222-4333-8444-555555555555',
          activityOpaqueId: 'a1b2c3d4e5f6',
          guildId: '1534228693017432124',
          organizationId: 'org-test',
          activityTypeKey: 'azrael',
          fingerprint: 'fp-1',
        },
      },
      'proj-secret',
    );

    expect(result.status).toBe('delivered');
    expect(sendDirectMessage).toHaveBeenCalledOnce();
    const payload = sendDirectMessage.mock.calls[0]![1] as { components?: unknown[] };
    expect(payload.components).toHaveLength(1);
    const rowJson = (
      payload.components?.[0] as { toJSON: () => { components: unknown[] } }
    ).toJSON();
    expect(rowJson.components).toHaveLength(4);
    const labels = rowJson.components.map((button) => (button as { label?: string }).label);
    expect(labels).toEqual(
      expect.arrayContaining(['Dołącz', 'Zobacz', 'Nie teraz', expect.stringContaining('Wycisz')]),
    );
  });
});
