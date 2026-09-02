import { beforeEach, describe, expect, it, vi } from 'vitest';

import { opaqueIdFromUuid } from '@v2/hub-core';

import { DiscordGatewayConfigSchema, normalizeDiscordConfig } from '../discord/discord-config.js';
import { decodeLfgDmContext } from '../security/lfg-dm-context.js';
import { parseLfgDmCustomId } from '../security/lfg-dm-signed-custom-id.js';
import {
  buildDeliveryActionComponents,
  NotificationDmDeliveryService,
} from './notification-dm-delivery.service.js';

const secret = 's'.repeat(32);
const intentId = '22222222-2222-4222-8222-222222222222';

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

  it('renders role-specific join buttons with durable intent context', () => {
    const rows = buildDeliveryActionComponents(
      {
        template: 'lfg_match',
        activityId: '11111111-1111-4111-8111-111111111111',
        activityOpaqueId: 'a1b2c3d4e5f6',
        guildId: '1534228693017432124',
        organizationId: 'org-test',
        activityTypeKey: 'azrael',
        fingerprint: 'fp-1',
        intentId,
        intentOpaqueId: opaqueIdFromUuid(intentId),
        eligiblePartyRoles: ['BUFF', 'DPS'],
      },
      '1534228693017432124',
      'DISCOVERY',
      secret,
    );
    expect(rows).toHaveLength(3);
    const joinRow = rows![0]!.toJSON();
    expect(joinRow.components).toHaveLength(2);
    const firstJoin = joinRow.components?.[0] as { custom_id?: string; label?: string };
    expect(firstJoin.label).toBe('BUFF');
    const parsed = parseLfgDmCustomId(String(firstJoin.custom_id), secret);
    expect(decodeLfgDmContext(parsed.param)?.kind).toBe('intent');
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
          suggestedPartyRole: 'BUFF',
        },
      },
      'proj-secret',
    );

    expect(result.status).toBe('delivered');
    expect(sendDirectMessage).toHaveBeenCalledOnce();
    const payload = sendDirectMessage.mock.calls[0]![1] as { components?: unknown[] };
    expect(payload.components).toHaveLength(3);
    const allLabels = (payload.components ?? []).flatMap((row) => {
      const json = (row as { toJSON: () => { components: unknown[] } }).toJSON();
      return json.components.map((button) => (button as { label?: string }).label);
    });
    expect(allLabels).toEqual(
      expect.arrayContaining(['Dołącz', 'Zobacz', 'Nie teraz', expect.stringContaining('Wycisz')]),
    );
  });

  it('dedupes successful DM delivery by outboxId within process', async () => {
    const sendDirectMessage = vi.fn(() => Promise.resolve({ ok: true, messageId: 'm1' }));
    const service = new NotificationDmDeliveryService({ sendDirectMessage } as never, makeConfig());
    const body = {
      outboxId: 'outbox-dm-1',
      inboxItemId: 'inbox-1',
      recipientDiscordUserId: '222222222222222222',
      title: 'Dopasowanie',
      body: 'Twoja rola pasuje.',
      notificationClass: 'DISCOVERY',
      kind: 'lfg.match',
    };
    const first = await service.deliver(body, 'proj-secret');
    const second = await service.deliver(body, 'proj-secret');
    expect(first.status).toBe('delivered');
    expect(second.status).toBe('delivered');
    expect(sendDirectMessage).toHaveBeenCalledOnce();
  });
});
