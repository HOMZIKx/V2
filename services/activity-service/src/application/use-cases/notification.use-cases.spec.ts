import { describe, expect, it, vi } from 'vitest';

import type { ActivityTx } from '../ports/activity.ports.js';
import { enqueueUserNotification } from './notification.use-cases.js';

function makeTx(overrides: Partial<ActivityTx> = {}): ActivityTx {
  const base = {
    getNotificationPreference: () =>
      Promise.resolve({
        userDiscordId: 'u1',
        guildId: 'g1',
        dmEnabled: true,
        mutedInterestKeys: ['azrael'],
        mutedActivityTypeKeys: [] as string[],
        mutedActivityIds: [] as string[],
      }),
    getNotificationDedupeMemory: () => Promise.resolve(null),
    upsertNotificationDedupeMemory: () => Promise.resolve(),
    recordNotificationDeliveryAttempt: () => Promise.resolve(),
    enqueueInbox: () =>
      Promise.resolve({
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
      }),
    insertOutbox: () => Promise.resolve(),
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

  it('suppresses Azrael LFG discovery when activity type muted but allows transactional join notice', async () => {
    const mutedTypeTx = makeTx({
      getNotificationPreference: () =>
        Promise.resolve({
          userDiscordId: 'u1',
          guildId: 'g1',
          dmEnabled: true,
          mutedInterestKeys: [],
          mutedActivityTypeKeys: ['azrael'],
          mutedActivityIds: [],
        }),
    });

    const discovery = await enqueueUserNotification(
      mutedTypeTx,
      {
        guildId: 'g1',
        recipientDiscordUserId: 'u1',
        notificationClass: 'DISCOVERY',
        kind: 'lfg.match',
        title: 'Dopasowanie Azrael',
        body: 'Pasujesz do ekipy',
        dedupeKey: 'lfg-match-1',
        activityTypeKey: 'azrael',
        activityId: '11111111-1111-4111-8111-111111111111',
      },
      new Date(),
    );
    expect(discovery.suppressed).toBe(true);

    const transactional = await enqueueUserNotification(
      mutedTypeTx,
      {
        guildId: 'g1',
        recipientDiscordUserId: 'u1',
        notificationClass: 'TRANSACTIONAL',
        kind: 'activity.joined',
        title: 'Dołączyłeś do Azrael',
        body: 'Zapis potwierdzony',
        dedupeKey: 'join-1',
        activityTypeKey: 'azrael',
        activityId: '11111111-1111-4111-8111-111111111111',
      },
      new Date(),
    );
    expect(transactional.suppressed).toBe(false);
    expect(transactional.created).toBe(true);
  });

  it('dedupes unchanged fingerprints', async () => {
    const enqueueInbox = vi.fn(() => {
      throw new Error('should not enqueue');
    });
    const tx = makeTx({
      getNotificationDedupeMemory: () =>
        Promise.resolve({ fingerprint: 'same', lastNotifiedAt: new Date() }),
      enqueueInbox: enqueueInbox as unknown as ActivityTx['enqueueInbox'],
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
    expect(enqueueInbox).not.toHaveBeenCalled();
  });

  it('refreshes inbox and enqueues DM when fingerprint changes under same dedupeKey', async () => {
    const insertOutbox = vi.fn();
    const enqueueInbox = vi.fn(() =>
      Promise.resolve({
        created: false,
        item: {
          id: '11111111-1111-1111-1111-111111111111',
          guildId: 'g1',
          recipientDiscordUserId: 'u1',
          recipientV2UserId: null,
          kind: 'lfg.match',
          payload: {},
          readAt: null,
          createdAt: new Date(),
          fingerprint: 'new',
        },
      }),
    );
    const tx = makeTx({
      getNotificationDedupeMemory: () =>
        Promise.resolve({ fingerprint: 'old', lastNotifiedAt: new Date() }),
      enqueueInbox: enqueueInbox as unknown as ActivityTx['enqueueInbox'],
      insertOutbox: insertOutbox as unknown as ActivityTx['insertOutbox'],
    });
    const result = await enqueueUserNotification(
      tx,
      {
        guildId: 'g1',
        recipientDiscordUserId: 'u1',
        notificationClass: 'DISCOVERY',
        kind: 'lfg.match',
        title: 'updated',
        body: 'body',
        dedupeKey: 'dup',
        fingerprint: 'new',
      },
      new Date(),
    );
    expect(result.suppressed).toBe(false);
    expect(insertOutbox).toHaveBeenCalledOnce();
  });
});
