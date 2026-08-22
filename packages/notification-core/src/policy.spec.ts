import { describe, expect, it } from 'vitest';

import {
  isDeliveryAllowedByPreference,
  notificationFingerprint,
  shouldAttemptDm,
  shouldSuppressAsUnchanged,
} from './policy.js';

describe('notification preference policy', () => {
  const pref = {
    userDiscordId: 'u1',
    guildId: 'g1',
    dmEnabled: true,
    mutedInterestKeys: ['azrael'],
    mutedActivityTypeKeys: ['dungeon'],
    mutedActivityIds: ['act-1'],
  };

  it('allows transactional when discovery interest is muted', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'TRANSACTIONAL',
        preference: pref,
        muteKey: { interestKey: 'azrael' },
      }),
    ).toBe(true);
  });

  it('allows system security regardless of mute keys', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'SYSTEM_SECURITY',
        preference: pref,
        muteKey: { interestKey: 'azrael', activityTypeKey: 'dungeon', activityId: 'act-1' },
      }),
    ).toBe(true);
  });

  it('allows discovery when preference is null', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: null,
        muteKey: { interestKey: 'azrael' },
      }),
    ).toBe(true);
  });

  it('blocks discovery when interest is muted', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: pref,
        muteKey: { interestKey: 'azrael' },
      }),
    ).toBe(false);
  });

  it('blocks discovery when activity type is muted', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: pref,
        muteKey: { activityTypeKey: 'dungeon' },
      }),
    ).toBe(false);
  });

  it('blocks discovery when activity id is muted', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: pref,
        muteKey: { activityId: 'act-1' },
      }),
    ).toBe(false);
  });

  it('allows discovery when mute keys are not muted', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: pref,
        muteKey: { interestKey: 'other' },
      }),
    ).toBe(true);
  });

  it('allows discovery without mute key', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: pref,
      }),
    ).toBe(true);
  });

  it('respects dm preference and suppresses unchanged fingerprints', () => {
    expect(shouldAttemptDm(null)).toBe(true);
    expect(shouldAttemptDm(pref)).toBe(true);
    expect(shouldAttemptDm({ ...pref, dmEnabled: false })).toBe(false);

    expect(
      shouldSuppressAsUnchanged({
        previousFingerprint: 'a|b',
        nextFingerprint: 'a|b',
        alreadyNotified: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressAsUnchanged({
        previousFingerprint: 'a|b',
        nextFingerprint: 'a|c',
        alreadyNotified: true,
      }),
    ).toBe(false);
    expect(
      shouldSuppressAsUnchanged({
        previousFingerprint: 'a|b',
        nextFingerprint: 'a|b',
        alreadyNotified: false,
      }),
    ).toBe(false);
  });

  it('builds stable notification fingerprints', () => {
    expect(notificationFingerprint(['a', 'b'])).toBe('a|b');
  });
});
