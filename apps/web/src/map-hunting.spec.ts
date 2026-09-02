import { describe, expect, it } from 'vitest';
import { buildMapRespawnRecords, getRespawnPhase, respawnKey, respawnMaps } from './respawn-timers.js';

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
  it('marks freshly confirmed respawns as killed', () => {
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
    const record = { ...buildMapRespawnRecords(map, 1)[0]!, confirmedAt: 1_000_000, confirmedBy: 'Mateusz' };
    expect(getRespawnPhase(record, 1_000_000)).toBe('killed_recently');
  });
});
