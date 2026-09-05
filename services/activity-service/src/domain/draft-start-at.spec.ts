import { describe, expect, it } from 'vitest';

import { normalizeDraftPayloadStartAt } from '../application/use-cases/activity.use-cases.js';
import { ActivityError } from '../domain/errors.js';

describe('normalizeDraftPayloadStartAt', () => {
  it('rejects non-ISO startAt values like DAS12', () => {
    expect(() => normalizeDraftPayloadStartAt({ startAt: 'DAS12', name: 'x' })).toThrow(
      ActivityError,
    );
    try {
      normalizeDraftPayloadStartAt({ startAt: 'DAS12' });
    } catch (error) {
      expect(error).toBeInstanceOf(ActivityError);
      expect((error as ActivityError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('accepts canonical ISO timestamps', () => {
    const out = normalizeDraftPayloadStartAt({
      startAt: '2026-08-20T16:00:00.000Z',
      name: 'Raid',
    });
    expect(out.startAt).toBe('2026-08-20T16:00:00.000Z');
    expect(out.name).toBe('Raid');
  });
});
