import { describe, expect, it } from 'vitest';
import { buildMapRespawnRecords, canConfirmRespawn, getRespawnClock, getRespawnPhase, respawnKey, respawnMaps } from './respawn-timers.js';

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
  it('keeps a confirmed respawn blocked through countdown, window and map marker', () => {
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
    const record = { ...buildMapRespawnRecords(map, 1)[0]!, confirmedAt: 1_000_000, confirmedBy: 'Mateusz' };
    expect(getRespawnPhase(record, 1_000_000)).toBe('countdown');
    expect(getRespawnClock(record, 1_000_000)).not.toBe('--:--');
    expect(canConfirmRespawn(record, 1_000_000)).toBe(false);
  });
  it('unblocks a timer only after the old map-marker lifetime finishes', () => {
    const map = respawnMaps.find((entry) => entry.key === 'M1')!;
    const fixedBoss = map.bosses.find((entry) => entry.respawnTimeMin === entry.respawnTimeMax)!;
    const record = { ...buildMapRespawnRecords(map, 1).find((entry) => entry.entity.id === fixedBoss.id)!, confirmedAt: 0, confirmedBy: 'Mateusz' };
    expect(getRespawnPhase(record, fixedBoss.respawnTimeMax * 60_000 + 60_000)).toBe('on_map');
    expect(canConfirmRespawn(record, fixedBoss.respawnTimeMax * 60_000 + 60_000)).toBe(false);
    expect(getRespawnPhase(record, fixedBoss.respawnTimeMax * 60_000 + 5 * 60_000 + 60_001)).toBe('expired');
    expect(canConfirmRespawn(record, fixedBoss.respawnTimeMax * 60_000 + 5 * 60_000 + 60_001)).toBe(true);
  });
});
