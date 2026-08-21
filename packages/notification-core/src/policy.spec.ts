import { describe, expect, it } from 'vitest';

import {
  isDeliveryAllowedByPreference,
  shouldAttemptDm,
  shouldSuppressAsUnchanged,
} from './policy.js';

describe('notification preference policy', () => {
  const pref = {
    userDiscordId: 'u1',
    guildId: 'g1',
    dmEnabled: true,
    mutedInterestKeys: ['azrael'],
    mutedActivityTypeKeys: [] as string[],
    mutedActivityIds: [] as string[],
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

  it('blocks discovery when interest is muted', () => {
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'DISCOVERY',
        preference: pref,
        muteKey: { interestKey: 'azrael' },
      }),
    ).toBe(false);
  });

  it('suppresses unchanged already-notified fingerprints', () => {
    expect(
      shouldSuppressAsUnchanged({
        previousFingerprint: 'a|b',
        nextFingerprint: 'a|b',
        alreadyNotified: true,
      }),
    ).toBe(true);
    expect(shouldAttemptDm({ ...pref, dmEnabled: false })).toBe(false);
  });
});
