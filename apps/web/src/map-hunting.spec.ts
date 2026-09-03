import { describe, expect, it } from 'vitest';
import {
  buildMapRespawnRecords,
  canConfirmRespawn,
  getRespawnClock,
  getRespawnPhase,
  respawnKey,
  respawnMaps,
  respawnWindowMinutes,
} from './respawn-timers.js';

describe('respawn timers imported from dobry-temat', () => {
  it('keeps maps and channels separate from characters and equipment', () => {
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
    expect(map.channels).toBe(8);
    expect(respawnKey('metin', 'M1', 3, 'metin1')).toBe('metin-M1-ch3-metin1');
  });

  it('creates timers for the selected map and channel', () => {
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
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
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
    const ranged = map.metins.find((entry) => entry.respawnTimeMax - entry.respawnTimeMin >= 5)!;
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
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
    const fixedBoss = map.bosses.find((entry) => entry.respawnTimeMin === entry.respawnTimeMax)!;
    const record = {
      ...buildMapRespawnRecords(map, 1).find((entry) => entry.entity.id === fixedBoss.id)!,
      confirmedAt: 0,
      confirmedBy: 'Mateusz',
    };
    expect(getRespawnPhase(record, fixedBoss.respawnTimeMax * 60_000 + 5 * 60_000 + 60_001)).toBe(
      'expired',
    );
    expect(canConfirmRespawn(record, fixedBoss.respawnTimeMax * 60_000 + 5 * 60_000 + 60_001)).toBe(
      true,
    );
  });
});
