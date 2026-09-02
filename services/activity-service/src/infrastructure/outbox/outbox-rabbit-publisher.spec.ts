import { describe, expect, it, vi } from 'vitest';

import { ActivityOutboxRabbitPublisher } from './outbox-rabbit-publisher.js';

describe('ActivityOutboxRabbitPublisher', () => {
  it('returns error when publish throws (broker unavailable path)', async () => {
    const publisher = new ActivityOutboxRabbitPublisher('amqp://invalid-host-for-test:5672');
    vi.spyOn(publisher, 'ensureReady').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await publisher.publish({
      id: '11111111-1111-4111-8111-111111111111',
      eventType: 'activity.activity.projection_requested.v1',
      aggregateType: 'activity',
      aggregateId: '22222222-2222-4222-8222-222222222222',
      aggregateVersion: 1,
      payload: {
        organizationId: 'org',
        guildId: 'g1',
        channelId: 'c1',
        opaqueId: 'aaaaaaaaaaaa',
      },
      status: 'claimed',
      attemptCount: 1,
    });
    expect(result).toBe('error');
  });
});
