import { describe, expect, it } from 'vitest';

import { asNullableDate } from './pg-value-mappers.js';

describe('asNullableDate', () => {
  it('accepts Date instances from node-pg timestamptz', () => {
    const input = new Date('2026-08-16T12:00:00.000Z');
    expect(asNullableDate(input)).toBe(input);
  });

  it('accepts ISO strings', () => {
    const result = asNullableDate('2026-08-16T12:00:00.000Z');
    expect(result?.toISOString()).toBe('2026-08-16T12:00:00.000Z');
  });

  it('returns null for nullish', () => {
    expect(asNullableDate(null)).toBeNull();
    expect(asNullableDate(undefined)).toBeNull();
  });

  it('rejects invalid Date and unsupported types', () => {
    expect(() => asNullableDate(new Date('not-a-date'))).toThrow(/valid Date/);
    expect(() => asNullableDate({})).toThrow(/date-compatible/);
  });
});
