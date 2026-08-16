import { describe, expect, it } from 'vitest';

import { ActivityProjectionDeliveryV1Schema } from './activity-projection-delivery.v1.js';

function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

describe('ActivityProjectionDeliveryV1Schema', () => {
  const valid = {
    outboxId: '11111111-1111-4111-8111-111111111111',
    eventType: 'activity.activity.created.v1',
    aggregateType: 'activity',
    aggregateId: '22222222-2222-4222-8222-222222222222',
    aggregateVersion: 3,
    payload: { guildId: 'guild-1', opaqueId: 'abcdef012345' },
    attemptCount: 1,
    correlationId: 'corr-1',
    guildId: 'guild-1',
  };

  it('parses a full delivery envelope', () => {
    expect(ActivityProjectionDeliveryV1Schema.parse(valid)).toEqual(valid);
  });

  it('allows omitting optional fields', () => {
    const required = omit(valid, 'attemptCount', 'correlationId', 'guildId');
    expect(ActivityProjectionDeliveryV1Schema.parse(required)).toEqual(required);
  });

  it('rejects empty outboxId', () => {
    expect(ActivityProjectionDeliveryV1Schema.safeParse({ ...valid, outboxId: '' }).success).toBe(
      false,
    );
  });

  it('rejects non-object payload', () => {
    expect(
      ActivityProjectionDeliveryV1Schema.safeParse({ ...valid, payload: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects negative aggregateVersion', () => {
    expect(
      ActivityProjectionDeliveryV1Schema.safeParse({ ...valid, aggregateVersion: -1 }).success,
    ).toBe(false);
  });
});
