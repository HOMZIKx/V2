import { describe, expect, it } from 'vitest';

import type { MetinGeneralHuntRoute } from './metin-general-hunts-api';
import {
  formatWarsawHuntClock,
  metinGeneralHuntEventCycleKey,
  nextMetinGeneralHuntSpawn,
  pickRouteColor,
  routeColorAssignments,
  smoothRoutePath,
} from './metin-general-hunt-visuals';

function route(userId: string, color?: string): MetinGeneralHuntRoute {
  return {
    id: `route-${userId}`,
    userId,
    displayName: userId,
    channel: 1,
    ...(color === undefined ? {} : { color }),
    points: [{ x: 10, y: 10 }],
    updatedAt: 1,
  };
}

describe('metin/general hunt visuals', () => {
  it('rotates event key at the exact Warsaw spawn boundary', () => {
    expect(
      metinGeneralHuntEventCycleKey('metin-v2', Date.parse('2026-09-08T15:59:59.999Z')),
    ).toBe('2026-09-08T12:00@Europe/Warsaw/6h');
    expect(
      metinGeneralHuntEventCycleKey('metin-v2', Date.parse('2026-09-08T16:00:00.000Z')),
    ).toBe('2026-09-08T18:00@Europe/Warsaw/6h');
  });

  it('resolves the next Metin and General spawn from the Warsaw clock', () => {
    expect(
      nextMetinGeneralHuntSpawn(6, Date.parse('2026-09-08T15:59:00.000Z')),
    ).toBe(Date.parse('2026-09-08T16:00:00.000Z'));
    expect(
      nextMetinGeneralHuntSpawn(4, Date.parse('2026-01-15T02:30:00.000Z')),
    ).toBe(Date.parse('2026-01-15T03:00:00.000Z'));
    expect(formatWarsawHuntClock(Date.parse('2026-09-08T16:00:00.000Z'))).toBe('18:00');
  });

  it('keeps Warsaw spawn boundaries correct across daylight-saving transitions', () => {
    // 2026-03-29: Warsaw jumps from 01:59:59 CET to 03:00:00 CEST.
    expect(
      nextMetinGeneralHuntSpawn(4, Date.parse('2026-03-29T00:30:00.000Z')),
    ).toBe(Date.parse('2026-03-29T02:00:00.000Z'));

    // 2026-10-25: Warsaw repeats the 02:00 hour; 04:00 is unambiguous CET.
    expect(
      nextMetinGeneralHuntSpawn(4, Date.parse('2026-10-25T00:30:00.000Z')),
    ).toBe(Date.parse('2026-10-25T03:00:00.000Z'));
  });

  it('assigns a different visible color to each user and preserves stored colors', () => {
    const routes = [route('a', '#4cc9f0'), route('b'), route('c'), route('d')];
    const assignments = routeColorAssignments(routes);
    const colors = routes.map((item) => assignments.get(item.userId));
    expect(new Set(colors).size).toBe(routes.length);
    expect(assignments.get('a')).toBe('#4cc9f0');
    expect(pickRouteColor('e', routes)).not.toBe(assignments.get('a'));
  });

  it('turns clicked route points into a smooth bounded SVG path', () => {
    const path = smoothRoutePath([
      { x: 5, y: 5 },
      { x: 30, y: 10 },
      { x: 45, y: 70 },
      { x: 95, y: 90 },
    ]);
    expect(path.startsWith('M 5 5')).toBe(true);
    expect(path).toContain(' C ');
    expect(path).not.toContain('NaN');
  });
});
