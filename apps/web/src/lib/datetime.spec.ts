import { describe, expect, it } from 'vitest';

import { formatPolishDateTime } from './datetime';

describe('formatPolishDateTime', () => {
  it('formats a known UTC instant in Europe/Warsaw', () => {
    const utc = new Date('2026-01-15T11:00:00.000Z');
    expect(formatPolishDateTime(utc, 'Europe/Warsaw')).toBe('15.01.2026 12:00');
  });

  it('accepts ISO strings', () => {
    expect(formatPolishDateTime('2026-08-20T16:00:00.000Z', 'Europe/Warsaw')).toBe(
      '20.08.2026 18:00',
    );
  });

  it('returns em dash for invalid values', () => {
    expect(formatPolishDateTime('not-a-date')).toBe('—');
  });
});
