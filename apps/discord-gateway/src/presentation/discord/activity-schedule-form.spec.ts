import { describe, expect, it } from 'vitest';

import { resolveWhenKindSchedule } from './activity-schedule-form.js';
import { LocalizedDateParseError } from './localized-datetime.js';

const now = new Date('2026-08-16T12:00:00.000Z'); // Sunday afternoon Warsaw summer

describe('resolveWhenKindSchedule', () => {
  it('resolves exact datetime', () => {
    const resolved = resolveWhenKindSchedule({
      whenKind: 'exact',
      fromRaw: '20.08.2026 18:00',
      toRaw: '',
      now,
    });
    expect(resolved.scheduleKind).toBe('exact');
    expect(resolved.periodKey).toBeNull();
    expect(resolved.scheduleLabel).toContain('sierpnia');
    expect(resolved.scheduleLabel).toContain('18:00');
  });

  it('resolves range OD–DO', () => {
    const resolved = resolveWhenKindSchedule({
      whenKind: 'range',
      fromRaw: '20.08.2026 18:00',
      toRaw: '20.08.2026 22:00',
      now,
    });
    expect(resolved.scheduleKind).toBe('range');
    expect(resolved.endAt).not.toBeNull();
    expect(resolved.scheduleLabel).toMatch(/18:00–22:00/);
  });

  it('rejects range with end before start', () => {
    expect(() =>
      resolveWhenKindSchedule({
        whenKind: 'range',
        fromRaw: '20.08.2026 22:00',
        toRaw: '20.08.2026 18:00',
        now,
      }),
    ).toThrow(LocalizedDateParseError);
  });

  it('resolves today without hours', () => {
    const monday = new Date('2026-08-17T10:00:00.000Z');
    const resolved = resolveWhenKindSchedule({
      whenKind: 'today',
      fromRaw: '',
      toRaw: '',
      now: monday,
    });
    expect(resolved.scheduleKind).toBe('flexible_period');
    expect(resolved.periodKey).toBe('today');
    expect(resolved.scheduleHasExplicitTime).toBe(false);
    expect(resolved.scheduleLabel).toBe('Dzisiaj');
  });

  it('resolves today with hour range', () => {
    const monday = new Date('2026-08-17T10:00:00.000Z');
    const resolved = resolveWhenKindSchedule({
      whenKind: 'today',
      fromRaw: '18:00',
      toRaw: '22:00',
      now: monday,
    });
    expect(resolved.periodKey).toBe('today');
    expect(resolved.scheduleHasExplicitTime).toBe(true);
    expect(resolved.scheduleLabel).toContain('Dzisiaj');
    expect(resolved.scheduleLabel).toContain('18:00');
  });

  it('resolves tomorrow', () => {
    const resolved = resolveWhenKindSchedule({
      whenKind: 'tomorrow',
      fromRaw: '',
      toRaw: '',
      now,
    });
    expect(resolved.periodKey).toBe('tomorrow');
    expect(resolved.scheduleLabel).toBe('Jutro');
  });

  it('resolves this_week without forcing a date', () => {
    const resolved = resolveWhenKindSchedule({
      whenKind: 'this_week',
      fromRaw: '',
      toRaw: '',
      now,
    });
    expect(resolved.periodKey).toBe('this_week');
    expect(resolved.scheduleLabel).toBe('W tym tygodniu');
    expect(resolved.scheduleHasExplicitTime).toBe(false);
  });

  it('resolves weekend in guild timezone', () => {
    const wednesday = new Date('2026-08-19T10:00:00.000Z');
    const resolved = resolveWhenKindSchedule({
      whenKind: 'weekend',
      fromRaw: '',
      toRaw: '',
      now: wednesday,
    });
    expect(resolved.periodKey).toBe('weekend');
    expect(resolved.scheduleLabel).toBe('W weekend');
  });

  it('resolves flexible / do ustalenia', () => {
    const resolved = resolveWhenKindSchedule({
      whenKind: 'flexible',
      fromRaw: '',
      toRaw: '',
      now,
    });
    expect(resolved.periodKey).toBe('flexible');
    expect(resolved.scheduleLabel).toBe('Termin do ustalenia');
  });

  it('rejects exact without OD', () => {
    expect(() =>
      resolveWhenKindSchedule({ whenKind: 'exact', fromRaw: '', toRaw: '', now }),
    ).toThrow(LocalizedDateParseError);
  });
});
