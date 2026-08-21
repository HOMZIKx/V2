import { describe, expect, it, vi } from 'vitest';

import type { ActivityTx } from '../ports/activity.ports.js';
import { enqueueUserNotification } from './notification.use-cases.js';

function makeTx(overrides: Partial<ActivityTx> = {}): ActivityTx {
  const base = {
    async getNotificationPreference() {
      return {
        userDiscordId: 'u1',
        guildId: 'g1',
        dmEnabled: true,
        mutedInterestKeys: ['azrael'],
        mutedActivityTypeKeys: [] as string[],
        mutedActivityIds: [] as string[],
      };
    },
    async getNotificationDedupeMemory() {
      return null;
    },
    async upsertNotificationDedupeMemory() {},
    async recordNotificationDeliveryAttempt() {},
    async enqueueInbox() {
      return {
        created: true,
        item: {
          id: '11111111-1111-1111-1111-111111111111',
          guildId: 'g1',
          recipientDiscordUserId: 'u1',
          recipientV2UserId: null,
          kind: 'test',
          payload: {},
          readAt: null,
          createdAt: new Date(),
        },
      };
    },
    async insertOutbox() {},
  };
  return { ...base, ...overrides } as ActivityTx;
}

describe('enqueueUserNotification', () => {
  it('suppresses DISCOVERY when interest muted but allows TRANSACTIONAL', async () => {
    const discovery = await enqueueUserNotification(
      makeTx(),
      {
        guildId: 'g1',
        recipientDiscordUserId: 'u1',
        notificationClass: 'DISCOVERY',
        kind: 'lfg.offer',
        title: 'Azrael',
        body: 'Pasujesz',
        dedupeKey: 'd1',
        interestKey: 'azrael',
      },
      new Date(),
    );
    expect(discovery.suppressed).toBe(true);

    const transactional = await enqueueUserNotification(
      makeTx(),
      {
        guildId: 'g1',
        recipientDiscordUserId: 'u1',
        notificationClass: 'TRANSACTIONAL',
        kind: 'activity.schedule_changed',
        title: 'Zmiana terminu',
        body: 'Azrael przesunięty',
        dedupeKey: 't1',
        interestKey: 'azrael',
        activityId: '22222222-2222-4222-8222-222222222222',
      },
      new Date(),
    );
    expect(transactional.suppressed).toBe(false);
    expect(transactional.created).toBe(true);
  });

  it('dedupes unchanged fingerprints', async () => {
    const tx = makeTx({
      async getNotificationDedupeMemory() {
        return { fingerprint: 'same', lastNotifiedAt: new Date() };
      },
      enqueueInbox: vi.fn(async () => {
        throw new Error('should not enqueue');
      }) as ActivityTx['enqueueInbox'],
    });
    const result = await enqueueUserNotification(
      tx,
      {
        guildId: 'g1',
        recipientDiscordUserId: 'u1',
        notificationClass: 'DISCOVERY',
        kind: 'lfg.offer',
        title: 'x',
        body: 'y',
        dedupeKey: 'dup',
        fingerprint: 'same',
      },
      new Date(),
    );
    expect(result.suppressed).toBe(true);
  });
});
