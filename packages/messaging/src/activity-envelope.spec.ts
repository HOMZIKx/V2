import { describe, expect, it } from 'vitest';

import { messageIdFromOutboxId, parseActivityProjectionEnvelope } from './activity-envelope.js';
import {
  ACTIVITY_EVENTS_BINDING_KEY,
  ACTIVITY_EVENTS_EXCHANGE,
  DISCORD_ACTIVITY_PROJECTIONS_DLQ,
  DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
} from './activity-topology.js';

describe('@v2/messaging activity envelope', () => {
  it('parses a valid v1 envelope', () => {
    const outboxId = '11111111-1111-4111-8111-111111111111';
    const parsed = parseActivityProjectionEnvelope({
      envelopeVersion: 1,
      messageId: messageIdFromOutboxId(outboxId),
      outboxId,
      eventType: 'activity.activity.projection_requested.v1',
      occurredAt: '2026-08-20T21:00:00.000Z',
      organizationId: 'org-1',
      aggregateType: 'activity',
      aggregateId: '22222222-2222-4222-8222-222222222222',
      aggregateVersion: 3,
      correlationId: '33333333-3333-4333-8333-333333333333',
      projection: {
        mode: 'shared',
        targets: [{ guildId: 'g1', channelId: 'c1', opaqueProjectionId: 'abc123def456' }],
      },
      payload: { kind: 'projection' },
    });
    expect(parsed.projection.mode).toBe('shared');
    expect(parsed.messageId).toBe(outboxId);
  });

  it('rejects envelopeVersion other than 1', () => {
    expect(() =>
      parseActivityProjectionEnvelope({
        envelopeVersion: 2,
        messageId: '11111111-1111-4111-8111-111111111111',
        outboxId: '11111111-1111-4111-8111-111111111111',
        eventType: 'x',
        occurredAt: '2026-08-20T21:00:00.000Z',
        organizationId: 'org',
        aggregateType: 'activity',
        aggregateId: 'id',
        aggregateVersion: 1,
        correlationId: 'c',
        projection: { mode: 'single', targets: [{ guildId: 'g', channelId: 'c' }] },
        payload: {},
      }),
    ).toThrow();
  });
});

describe('@v2/messaging topology constants', () => {
  it('uses immutable Accepted names', () => {
    expect(ACTIVITY_EVENTS_EXCHANGE).toBe('v2.activity.events');
    expect(DISCORD_ACTIVITY_PROJECTIONS_QUEUE).toBe('v2.discord.activity.projections');
    expect(DISCORD_ACTIVITY_PROJECTIONS_DLQ).toBe('v2.discord.activity.projections.dlq');
    expect(ACTIVITY_EVENTS_BINDING_KEY).toBe('activity.#');
  });
});
