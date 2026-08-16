import { describe, expect, it } from 'vitest';

import { ActivityError } from './errors.js';
import {
  assertScheduleValid,
  formatScheduleLabel,
  resolveFlexiblePeriodBounds,
} from './schedule.js';

const WARSAW = 'Europe/Warsaw';

describe('resolveFlexiblePeriodBounds', () => {
  it('resolves today as local day bounds', () => {
    // 2026-08-16 15:00 Warsaw = 13:00 UTC (CEST, UTC+2)
    const now = new Date('2026-08-16T13:00:00.000Z');
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'today',
      now,
      timeZone: WARSAW,
    });
    expect(bounds.startAt.toISOString()).toBe('2026-08-15T22:00:00.000Z');
    expect(bounds.endAt.toISOString()).toBe('2026-08-16T21:59:59.999Z');
  });

  it('narrows today with fromTime/toTime', () => {
    const now = new Date('2026-08-16T13:00:00.000Z');
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'today',
      now,
      timeZone: WARSAW,
      fromTime: '18:00',
      toTime: '22:00',
    });
    expect(bounds.startAt.toISOString()).toBe('2026-08-16T16:00:00.000Z');
    expect(bounds.endAt.toISOString()).toBe('2026-08-16T20:00:00.000Z');
  });

  it('resolves tomorrow as next local day', () => {
    const now = new Date('2026-08-16T13:00:00.000Z');
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'tomorrow',
      now,
      timeZone: WARSAW,
    });
    expect(bounds.startAt.toISOString()).toBe('2026-08-16T22:00:00.000Z');
    expect(bounds.endAt.toISOString()).toBe('2026-08-17T21:59:59.999Z');
  });

  it('resolves this_week as Monday–Sunday in timezone', () => {
    // Sunday 2026-08-16 Warsaw → week Mon 10 – Sun 16
    const now = new Date('2026-08-16T13:00:00.000Z');
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'this_week',
      now,
      timeZone: WARSAW,
    });
    expect(bounds.startAt.toISOString()).toBe('2026-08-09T22:00:00.000Z');
    expect(bounds.endAt.toISOString()).toBe('2026-08-16T21:59:59.999Z');
  });

  it('resolves weekend as Sat–Sun in timezone, not UTC midnight', () => {
    // Friday evening UTC that is still Friday in Warsaw
    const now = new Date('2026-08-14T18:00:00.000Z'); // Fri 20:00 Warsaw
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'weekend',
      now,
      timeZone: WARSAW,
    });
    // Sat 2026-08-15 00:00 Warsaw = 2026-08-14T22:00:00.000Z
    expect(bounds.startAt.toISOString()).toBe('2026-08-14T22:00:00.000Z');
    // Sun 2026-08-16 23:59:59.999 Warsaw = 2026-08-16T21:59:59.999Z
    expect(bounds.endAt.toISOString()).toBe('2026-08-16T21:59:59.999Z');
    // Must NOT be UTC Saturday 00:00
    expect(bounds.startAt.toISOString()).not.toBe('2026-08-15T00:00:00.000Z');
  });

  it('resolves flexible as now → now+14d (explicit kind, not null)', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'flexible',
      now,
      timeZone: WARSAW,
    });
    expect(bounds.startAt.toISOString()).toBe(now.toISOString());
    expect(bounds.endAt.toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });
});

describe('assertScheduleValid', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('accepts exact within horizon', () => {
    expect(() =>
      assertScheduleValid({
        kind: 'exact',
        startAt: new Date('2026-08-20T16:00:00.000Z'),
        now,
        allowExtendedHorizon: false,
      }),
    ).not.toThrow();
  });

  it('accepts range when start <= end', () => {
    expect(() =>
      assertScheduleValid({
        kind: 'range',
        startAt: new Date('2026-08-20T16:00:00.000Z'),
        endAt: new Date('2026-08-20T20:00:00.000Z'),
        now,
        allowExtendedHorizon: false,
      }),
    ).not.toThrow();
  });

  it('rejects range when end < start', () => {
    expect(() =>
      assertScheduleValid({
        kind: 'range',
        startAt: new Date('2026-08-20T20:00:00.000Z'),
        endAt: new Date('2026-08-20T16:00:00.000Z'),
        now,
        allowExtendedHorizon: false,
      }),
    ).toThrow(ActivityError);
  });

  it('requires periodKey for flexible_period', () => {
    expect(() =>
      assertScheduleValid({
        kind: 'flexible_period',
        startAt: now,
        endAt: new Date(now.getTime() + 86400000),
        now,
        allowExtendedHorizon: false,
      }),
    ).toThrow(ActivityError);
  });

  it('allows ongoing this_week even when start is in the past', () => {
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'this_week',
      now,
      timeZone: WARSAW,
    });
    expect(bounds.startAt.getTime()).toBeLessThan(now.getTime());
    expect(() =>
      assertScheduleValid({
        kind: 'flexible_period',
        periodKey: 'this_week',
        startAt: bounds.startAt,
        endAt: bounds.endAt,
        now,
        allowExtendedHorizon: false,
      }),
    ).not.toThrow();
  });

  it('rejects flexible_period entirely in the past', () => {
    expect(() =>
      assertScheduleValid({
        kind: 'flexible_period',
        periodKey: 'today',
        startAt: new Date('2026-08-10T00:00:00.000Z'),
        endAt: new Date('2026-08-10T23:59:59.000Z'),
        now,
        allowExtendedHorizon: false,
      }),
    ).toThrow(ActivityError);
  });

  it('treats endAt as expiry bound for flexible periods', () => {
    const bounds = resolveFlexiblePeriodBounds({
      periodKey: 'weekend',
      now: new Date('2026-08-14T10:00:00.000Z'),
      timeZone: WARSAW,
    });
    expect(bounds.endAt.getTime()).toBeGreaterThan(bounds.startAt.getTime());
    assertScheduleValid({
      kind: 'flexible_period',
      periodKey: 'weekend',
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      now: new Date('2026-08-14T10:00:00.000Z'),
      allowExtendedHorizon: false,
    });
  });
});

describe('formatScheduleLabel', () => {
  it('formats exact in Polish', () => {
    const label = formatScheduleLabel({
      kind: 'exact',
      startAt: new Date('2026-08-20T16:00:00.000Z'), // 18:00 Warsaw
      timeZone: WARSAW,
      hasExplicitTime: true,
    });
    expect(label).toBe('20 sierpnia 2026, 18:00');
  });

  it('formats range same-day', () => {
    const label = formatScheduleLabel({
      kind: 'range',
      startAt: new Date('2026-08-20T16:00:00.000Z'),
      endAt: new Date('2026-08-20T20:00:00.000Z'),
      timeZone: WARSAW,
    });
    expect(label).toBe('20 sierpnia, 18:00–22:00');
  });

  it('formats today / today+hours / tomorrow / this_week / weekend / flexible', () => {
    expect(
      formatScheduleLabel({
        kind: 'flexible_period',
        periodKey: 'today',
        startAt: new Date('2026-08-15T22:00:00.000Z'),
        endAt: new Date('2026-08-16T21:59:59.999Z'),
        timeZone: WARSAW,
        hasExplicitTime: false,
      }),
    ).toBe('Dziś');

    expect(
      formatScheduleLabel({
        kind: 'flexible_period',
        periodKey: 'today',
        startAt: new Date('2026-08-16T16:00:00.000Z'),
        endAt: new Date('2026-08-16T20:00:00.000Z'),
        timeZone: WARSAW,
        hasExplicitTime: true,
      }),
    ).toBe('Dziś, 18:00–22:00');

    expect(
      formatScheduleLabel({
        kind: 'flexible_period',
        periodKey: 'tomorrow',
        startAt: new Date('2026-08-16T22:00:00.000Z'),
        endAt: new Date('2026-08-17T21:59:59.999Z'),
        timeZone: WARSAW,
        hasExplicitTime: false,
      }),
    ).toBe('Jutro');

    expect(
      formatScheduleLabel({
        kind: 'flexible_period',
        periodKey: 'this_week',
        startAt: new Date('2026-08-09T22:00:00.000Z'),
        endAt: new Date('2026-08-16T21:59:59.999Z'),
        timeZone: WARSAW,
      }),
    ).toBe('W tym tygodniu');

    expect(
      formatScheduleLabel({
        kind: 'flexible_period',
        periodKey: 'weekend',
        startAt: new Date('2026-08-14T22:00:00.000Z'),
        endAt: new Date('2026-08-16T21:59:59.999Z'),
        timeZone: WARSAW,
      }),
    ).toBe('W weekend');

    expect(
      formatScheduleLabel({
        kind: 'flexible_period',
        periodKey: 'flexible',
        startAt: new Date('2026-08-16T12:00:00.000Z'),
        endAt: new Date('2026-08-30T12:00:00.000Z'),
        timeZone: WARSAW,
      }),
    ).toBe('Termin do ustalenia');
  });
});
