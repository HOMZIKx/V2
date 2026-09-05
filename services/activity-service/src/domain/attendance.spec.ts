import { describe, expect, it } from 'vitest';

import { assertAttendanceWindowOpen } from './attendance.js';

describe('attendance window', () => {
  it('allows marking within 24h after finish', () => {
    const finished = new Date('2026-08-20T18:00:00.000Z');
    const now = new Date('2026-08-21T10:00:00.000Z');
    expect(() => assertAttendanceWindowOpen({ activityFinishedAt: finished, now })).not.toThrow();
  });

  it('rejects marking after 24h', () => {
    const finished = new Date('2026-08-20T18:00:00.000Z');
    const now = new Date('2026-08-21T19:00:00.000Z');
    expect(() => assertAttendanceWindowOpen({ activityFinishedAt: finished, now })).toThrow(/24h/);
  });

  it('rejects marking before finish', () => {
    const finished = new Date('2026-08-20T18:00:00.000Z');
    const now = new Date('2026-08-20T17:00:00.000Z');
    expect(() => assertAttendanceWindowOpen({ activityFinishedAt: finished, now })).toThrow(
      /after the activity finishes/,
    );
  });
});
