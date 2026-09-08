import { describe, expect, it } from 'vitest';

import {
  emptyMetinGeneralHuntEventState,
  metinGeneralHuntEventCycleKey,
} from './metin-general-hunt-cycle.js';

describe('metin/general hunt event cycle', () => {
  it('rotates legendary metin cycle exactly at Warsaw 18:00', () => {
    expect(
      metinGeneralHuntEventCycleKey('metin-red-las', new Date('2026-09-08T15:59:59.999Z')),
    ).toBe('2026-09-08T12:00@Europe/Warsaw/6h');
    expect(
      metinGeneralHuntEventCycleKey('metin-red-las', new Date('2026-09-08T16:00:00.000Z')),
    ).toBe('2026-09-08T18:00@Europe/Warsaw/6h');
  });

  it('rotates general cycle every four hours in Warsaw time', () => {
    expect(
      metinGeneralHuntEventCycleKey('general-v2', new Date('2026-09-08T13:59:59.999Z')),
    ).toBe('2026-09-08T12:00@Europe/Warsaw/4h');
    expect(
      metinGeneralHuntEventCycleKey('general-v2', new Date('2026-09-08T14:00:00.000Z')),
    ).toBe('2026-09-08T16:00@Europe/Warsaw/4h');
  });

  it('creates a completely clean state for a new event', () => {
    expect(
      emptyMetinGeneralHuntEventState('metin-v1', new Date('2026-09-08T16:00:00.000Z')),
    ).toEqual({
      huntKey: 'metin-v1',
      eventCycleKey: '2026-09-08T18:00@Europe/Warsaw/6h',
      routes: [],
      markers: [],
      requests: [],
      history: [],
    });
  });
});
