import { describe, expect, it } from 'vitest';

import { messageIdFromOutboxId, parseActivityProjectionEnvelope } from './index.js';

/**
 * P4.5 failure / resilience contract tests (unit-level).
 * Full broker/integration matrix remains for Zeabur dual-transport proof.
 */
describe('P4.5 projection envelope resilience contracts', () => {
  it('rejects poison envelopes that fail schema (DLQ candidate)', () => {
    expect(() => parseActivityProjectionEnvelope({ not: 'valid' })).toThrow();
    expect(() =>
      parseActivityProjectionEnvelope({
        envelopeVersion: 1,
        messageId: 'not-a-uuid',
        outboxId: 'also-bad',
        eventType: 'activity.activity.projection_requested.v1',
        occurredAt: new Date().toISOString(),
        organizationId: 'org',
        aggregateType: 'activity',
        aggregateId: 'a',
        aggregateVersion: 1,
        correlationId: 'c',
        projection: { mode: 'shared', targets: [] },
        payload: {},
      }),
    ).toThrow();
  });

  it('uses deterministic messageId from outboxId for publisher/consumer dedupe', () => {
    const outboxId = '11111111-1111-4111-8111-111111111111';
    expect(messageIdFromOutboxId(outboxId)).toBe(outboxId);
  });

  it('accepts versioned multi-target envelope', () => {
    const outboxId = '22222222-2222-4222-8222-222222222222';
    const envelope = parseActivityProjectionEnvelope({
      envelopeVersion: 1,
      messageId: outboxId,
      outboxId,
      eventType: 'activity.activity.projection_requested.v1',
      occurredAt: new Date().toISOString(),
      organizationId: 'org-1',
      aggregateType: 'activity',
      aggregateId: '33333333-3333-4333-8333-333333333333',
      aggregateVersion: 2,
      correlationId: 'corr-1',
      projection: {
        mode: 'separate',
        targets: [
          { guildId: 'g1', channelId: 'c1', opaqueProjectionId: 'aaaaaaaaaaaa' },
          { guildId: 'g2', channelId: 'c2', opaqueProjectionId: 'bbbbbbbbbbbb' },
        ],
      },
      payload: { activityId: '33333333-3333-4333-8333-333333333333', kind: 'event' },
    });
    expect(envelope.projection.targets).toHaveLength(2);
    expect(envelope.projection.mode).toBe('separate');
  });
});
