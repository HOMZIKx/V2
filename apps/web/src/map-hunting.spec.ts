import { describe, expect, it } from 'vitest';
import {
  buildMapRespawnRecords,
  canConfirmRespawn,
  channelsWithLateWindows,
  getRespawnClock,
  getRespawnPhase,
  isWindowLatePhase,
  partitionRespawnRecords,
  respawnKey,
  respawnMaps,
  respawnWindowMinutes,
} from './respawn-timers.js';

function sampleMap() {
  const map =
    respawnMaps.find((entry) => entry.key === 'M2') ??
    respawnMaps.find((entry) => entry.metins.length > 0)!;
  expect(map).toBeTruthy();
  return map;
}

describe('respawn timers imported from dobry-temat', () => {
  it('keeps maps and channels separate from characters and equipment', () => {
    const map = sampleMap();
    expect(map.channels).toBeGreaterThanOrEqual(1);
    expect(respawnKey('metin', map.key, 3, 'metin1')).toBe(`metin-${map.key}-ch3-metin1`);
  });

  it('creates timers for the selected map and channel', () => {
    const map = sampleMap();
    expect(buildMapRespawnRecords(map, 2).every((entry) => entry.channel === 2)).toBe(true);
  });

  it('treats catalog 20–30 as a 10 minute spawn window', () => {
    expect(
      respawnWindowMinutes({
        id: 'sample',
        name: 'Sample',
        respawnTimeMin: 20,
        respawnTimeMax: 30,
      }),
    ).toBe(10);
  });

  it('blocks Zbite during countdown and unlocks when the spawn window opens', () => {
    const map = sampleMap();
    const ranged =
      map.metins.find((entry) => entry.respawnTimeMax - entry.respawnTimeMin >= 5) ?? map.metins[0]!;
    const record = {
      ...buildMapRespawnRecords(map, 1).find((entry) => entry.entity.id === ranged.id)!,
      confirmedAt: 0,
      confirmedBy: 'Mateusz',
      location: { x: 40, y: 55 },
    };
    const midCountdown = (ranged.respawnTimeMin * 60_000) / 2;
    expect(getRespawnPhase(record, midCountdown)).toBe('countdown');
    expect(canConfirmRespawn(record, midCountdown)).toBe(false);
    expect(getRespawnClock(record, midCountdown)).not.toBe('--:--');

    const inWindow = ranged.respawnTimeMin * 60_000 + 60_000;
    expect(getRespawnPhase(record, inWindow)).toBe('window');
    expect(canConfirmRespawn(record, inWindow)).toBe(true);
  });

  it('allows a new kill after the previous cycle expires', () => {
    const map = sampleMap();
    const entity =
      map.bosses.find((entry) => entry.respawnTimeMin === entry.respawnTimeMax) ??
      map.metins[0] ??
      map.bosses[0]!;
    const record = {
      ...buildMapRespawnRecords(map, 1).find((entry) => entry.entity.id === entity.id)!,
      confirmedAt: 0,
      confirmedBy: 'Mateusz',
    };
    expect(getRespawnPhase(record, entity.respawnTimeMax * 60_000 + 5 * 60_000 + 60_001)).toBe(
      'expired',
    );
    expect(canConfirmRespawn(record, entity.respawnTimeMax * 60_000 + 5 * 60_000 + 60_001)).toBe(
      true,
    );
  });

  it('splits counting timers from available ones and flags late window channels', () => {
    const map = sampleMap();
    const ranged =
      map.metins.find((entry) => entry.respawnTimeMax - entry.respawnTimeMin >= 5) ?? map.metins[0]!;
    const counting = {
      ...buildMapRespawnRecords(map, 1).find((entry) => entry.entity.id === ranged.id)!,
      confirmedAt: 0,
      confirmedBy: 'Mateusz',
      location: { x: 10, y: 20 },
    };
    const lateWindowAt =
      ranged.respawnTimeMin * 60_000 +
      Math.floor((ranged.respawnTimeMax - ranged.respawnTimeMin) * 60_000 * 0.85);
    const late = { ...counting, channel: 4 };
    expect(
      partitionRespawnRecords([counting], (ranged.respawnTimeMin * 60_000) / 2).counting,
    ).toHaveLength(1);
    if (ranged.respawnTimeMax > ranged.respawnTimeMin) {
      expect(isWindowLatePhase(late, lateWindowAt)).toBe(true);
      expect(channelsWithLateWindows([late], map.key, lateWindowAt)).toEqual([4]);
    }
  });

  it('attaches generated icon paths to entities when mapped', () => {
    const map = sampleMap();
    const withIcon = [...map.metins, ...map.bosses].find((entry) => entry.iconPath);
    // Catalog may leave unmatched entities without art — only assert when present.
    if (withIcon) {
      expect(withIcon.iconPath).toMatch(/^\/game\/respawn\//u);
    } else {
      expect(map.metins.length + map.bosses.length).toBeGreaterThan(0);
    }
  });
});
