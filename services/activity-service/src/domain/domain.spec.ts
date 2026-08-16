import { describe, expect, it } from 'vitest';

import { countOccupiedSlots, hasOpenSeat } from './capacity.js';
import { FixedClock } from './clock.js';
import {
  assertCreateLimit,
  assertStartHorizon,
  draftExpiresAt,
  isDraftExpired,
} from './create-limits.js';
import { ActivityError } from './errors.js';
import { assertTransition, canPermanentlyDelete, scheduledFinishAt } from './lifecycle.js';
import { generateOpaqueId, isValidOpaqueId, opaqueIdFromUuid } from './opaque-id.js';
import { isReconfirmExpired, resolveReconfirmDeadline } from './reconfirmation.js';
import { serviceName } from './service-name.js';
import { assertValidReferenceStatus } from './status-def.js';
import { assignWaitlistPosition, nextWaitlistPromotion } from './waitlist.js';

describe('service-name', () => {
  it('is activity-service', () => {
    expect(serviceName).toBe('activity-service');
  });
});

describe('opaque-id', () => {
  it('derives 12-char lowercase hex from uuid', () => {
    const opaque = opaqueIdFromUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(opaque).toBe('a1b2c3d4e5f6');
    expect(isValidOpaqueId(opaque)).toBe(true);
  });

  it('generates valid opaque ids', () => {
    expect(isValidOpaqueId(generateOpaqueId())).toBe(true);
  });
});

describe('lifecycle', () => {
  it('allows published → registrations_open', () => {
    expect(() => assertTransition('published', 'registrations_open')).not.toThrow();
  });

  it('rejects completed → published', () => {
    expect(() => assertTransition('completed', 'published')).toThrow(ActivityError);
  });

  it('computes finish as start+2h when no end', () => {
    const start = new Date('2026-08-16T12:00:00.000Z');
    expect(scheduledFinishAt(start, null).toISOString()).toBe('2026-08-16T14:00:00.000Z');
  });

  it('allows permanent delete only before start with zero participants', () => {
    const start = new Date('2026-08-20T12:00:00.000Z');
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(
      canPermanentlyDelete({
        status: 'published',
        startAt: start,
        now,
        participantCount: 0,
      }),
    ).toBe(true);
    expect(
      canPermanentlyDelete({
        status: 'published',
        startAt: start,
        now,
        participantCount: 1,
      }),
    ).toBe(false);
  });
});

describe('status-def', () => {
  it('requires confirmed occupiesSlot for reference statuses', () => {
    expect(() =>
      assertValidReferenceStatus(
        {
          id: '1',
          active: true,
          selectableByMember: true,
          occupiesSlot: true,
          behavior: 'confirmed',
        },
        'organizerDefault',
      ),
    ).not.toThrow();
    expect(() =>
      assertValidReferenceStatus(
        {
          id: '2',
          active: true,
          selectableByMember: true,
          occupiesSlot: false,
          behavior: 'tentative',
        },
        'waitlistPromotion',
      ),
    ).toThrow(ActivityError);
  });
});

describe('capacity', () => {
  it('counts occupied seats including requires_reconfirmation', () => {
    expect(
      countOccupiedSlots([
        {
          occupiesSlot: true,
          confirmationState: 'requires_reconfirmation',
          waitlistPosition: null,
          resignedAt: null,
          removedAt: null,
        },
        {
          occupiesSlot: true,
          confirmationState: 'confirmed',
          waitlistPosition: 1,
          resignedAt: null,
          removedAt: null,
        },
        {
          occupiesSlot: false,
          confirmationState: 'confirmed',
          waitlistPosition: null,
          resignedAt: null,
          removedAt: null,
        },
      ]),
    ).toBe(1);
  });

  it('detects open seats', () => {
    expect(hasOpenSeat({ participantLimit: 2, currentOccupied: 1 })).toBe(true);
    expect(hasOpenSeat({ participantLimit: 2, currentOccupied: 2 })).toBe(false);
    expect(hasOpenSeat({ participantLimit: null, currentOccupied: 99 })).toBe(true);
  });
});

describe('waitlist', () => {
  it('promotes FIFO by position', () => {
    expect(
      nextWaitlistPromotion([
        { id: 'b', waitlistPosition: 2 },
        { id: 'a', waitlistPosition: 1 },
      ])?.id,
    ).toBe('a');
  });

  it('assigns next position', () => {
    expect(assignWaitlistPosition([])).toBe(1);
    expect(assignWaitlistPosition([1, 3])).toBe(4);
  });
});

describe('reconfirmation', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');
  const start = new Date('2026-08-16T18:00:00.000Z');

  it('defaults deadline to start', () => {
    expect(resolveReconfirmDeadline({ now, startAt: start }).toISOString()).toBe(
      start.toISOString(),
    );
  });

  it('rejects deadline sooner than 15 minutes when start is later', () => {
    expect(() =>
      resolveReconfirmDeadline({
        now,
        startAt: start,
        requestedDeadline: new Date('2026-08-16T12:05:00.000Z'),
      }),
    ).toThrow(ActivityError);
  });

  it('detects expired reconfirm', () => {
    expect(
      isReconfirmExpired({
        confirmationState: 'requires_reconfirmation',
        reconfirmDeadline: new Date('2026-08-16T11:00:00.000Z'),
        now,
      }),
    ).toBe(true);
  });
});

describe('create-limits', () => {
  const clock = new FixedClock(new Date('2026-08-16T12:00:00.000Z'));

  it('enforces max 4', () => {
    expect(() => assertCreateLimit({ activeOwnCount: 4, maxActivePerCreator: 4 })).toThrow(
      ActivityError,
    );
    expect(() => assertCreateLimit({ activeOwnCount: 3, maxActivePerCreator: 4 })).not.toThrow();
  });

  it('enforces 14-day horizon for ordinary members', () => {
    const now = clock.now();
    expect(() =>
      assertStartHorizon({
        startAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        now,
        allowExtendedHorizon: false,
      }),
    ).toThrow(ActivityError);
    expect(() =>
      assertStartHorizon({
        startAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        now,
        allowExtendedHorizon: true,
      }),
    ).not.toThrow();
  });

  it('expires drafts after 24h', () => {
    const now = clock.now();
    const expires = draftExpiresAt(now);
    expect(isDraftExpired(expires, now)).toBe(false);
    expect(isDraftExpired(expires, new Date(now.getTime() + 24 * 60 * 60 * 1000))).toBe(true);
  });
});
