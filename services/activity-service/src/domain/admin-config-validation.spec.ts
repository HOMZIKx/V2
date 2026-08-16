import { describe, expect, it } from 'vitest';

import {
  assertCreateHorizonDays,
  assertParticipantFieldType,
  assertPingRoleIds,
  assertPostRetentionHours,
  evaluateAdminReadiness,
  MAX_PING_ROLE_IDS,
  validateOrganizerDefault,
  validateWaitlistPromotion,
} from './admin-config-validation.js';
import { ActivityError } from './errors.js';

describe('admin-config-validation', () => {
  const confirmed = {
    id: '1',
    active: true,
    selectableByMember: true,
    occupiesSlot: true,
    behavior: 'confirmed' as const,
  };

  it('accepts valid organizerDefault / waitlistPromotion refs', () => {
    expect(() => validateOrganizerDefault(confirmed)).not.toThrow();
    expect(() => validateWaitlistPromotion(confirmed)).not.toThrow();
  });

  it('rejects dangling / invalid status refs', () => {
    expect(() => validateOrganizerDefault(undefined)).toThrow(ActivityError);
    expect(() =>
      validateWaitlistPromotion({
        ...confirmed,
        occupiesSlot: false,
        behavior: 'tentative',
      }),
    ).toThrow(ActivityError);
  });

  it('whitelists participant field types', () => {
    expect(() => assertParticipantFieldType('text')).not.toThrow();
    expect(() => assertParticipantFieldType('select')).not.toThrow();
    expect(() => assertParticipantFieldType('markdown')).toThrow(ActivityError);
  });

  it('enforces ping role storage limits and forbids @everyone/@here', () => {
    expect(() => assertPingRoleIds(['111', '222'])).not.toThrow();
    expect(() => assertPingRoleIds(['@everyone'])).toThrow(ActivityError);
    expect(() => assertPingRoleIds(['here'])).toThrow(ActivityError);
    expect(() =>
      assertPingRoleIds(Array.from({ length: MAX_PING_ROLE_IDS + 1 }, (_, i) => `${i}`)),
    ).toThrow(ActivityError);
  });

  it('enforces horizon and retention bounds', () => {
    expect(() => assertCreateHorizonDays(14)).not.toThrow();
    expect(() => assertCreateHorizonDays(0)).toThrow(ActivityError);
    expect(() => assertCreateHorizonDays(400)).toThrow(ActivityError);
    expect(() => assertPostRetentionHours(72)).not.toThrow();
    expect(() => assertPostRetentionHours(0)).toThrow(ActivityError);
    expect(() => assertPostRetentionHours(1000)).toThrow(ActivityError);
  });

  it('reports READY when snapshot is complete', () => {
    const result = evaluateAdminReadiness({
      organizerDefaultStatusId: '1',
      waitlistPromotionStatusId: '1',
      organizerDefaultStatus: confirmed,
      waitlistPromotionStatus: confirmed,
      enabledActivityTypeCount: 1,
      activeStatusDefCount: 1,
      hubChannelId: 'channel-1',
      allowedPublishChannelCount: 1,
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports NOT ready with issues when incomplete', () => {
    const result = evaluateAdminReadiness({
      organizerDefaultStatusId: null,
      waitlistPromotionStatusId: null,
      organizerDefaultStatus: undefined,
      waitlistPromotionStatus: undefined,
      enabledActivityTypeCount: 0,
      activeStatusDefCount: 0,
      hubChannelId: null,
      allowedPublishChannelCount: 0,
    });
    expect(result.ready).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'ORGANIZER_DEFAULT_MISSING',
        'WAITLIST_PROMOTION_MISSING',
        'NO_ENABLED_ACTIVITY_TYPES',
        'NO_ACTIVE_STATUS_DEFS',
        'HUB_CHANNEL_MISSING',
        'NO_ALLOWED_PUBLISH_CHANNELS',
      ]),
    );
  });
});
