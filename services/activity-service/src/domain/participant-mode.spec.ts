import { describe, expect, it } from 'vitest';

import {
  filterParticipationsForMode,
  normalizeParticipantMode,
  resolveParticipationScopeGuildId,
} from './participant-mode.js';

describe('participant-mode', () => {
  it('defaults unknown values to shared', () => {
    expect(normalizeParticipantMode(undefined)).toBe('shared');
    expect(normalizeParticipantMode('weird')).toBe('shared');
    expect(normalizeParticipantMode('separate')).toBe('separate');
  });

  it('scopes SEPARATE RSVP to request guild and SHARED to null', () => {
    expect(
      resolveParticipationScopeGuildId({ mode: 'separate', requestGuildId: 'g-a' }),
    ).toBe('g-a');
    expect(
      resolveParticipationScopeGuildId({ mode: 'shared', requestGuildId: 'g-a' }),
    ).toBeNull();
  });

  it('filters participation pools by mode', () => {
    const rows = [
      { scopeGuildId: null },
      { scopeGuildId: 'g-a' },
      { scopeGuildId: 'g-b' },
    ];
    expect(filterParticipationsForMode(rows, 'shared', 'g-a')).toEqual([{ scopeGuildId: null }]);
    expect(filterParticipationsForMode(rows, 'separate', 'g-a')).toEqual([{ scopeGuildId: 'g-a' }]);
  });
});
