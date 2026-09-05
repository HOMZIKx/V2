import { describe, expect, it } from 'vitest';
import { respawnMaps } from './respawn-timers.js';
import {
  buildMapTimerRecords,
  expandMapMetins,
  listMetinTypes,
  mergeTimerRecordState,
  setMetinSlotCount,
} from './timers-metin-counts.js';

describe('timers metin counts', () => {
  it('builds metin-only timer records (no bosses)', () => {
    const map =
      respawnMaps.find((entry) => entry.key === 'M2') ??
      respawnMaps.find((entry) => entry.metins.length > 0)!;
    expect(map.metins.length).toBeGreaterThan(0);
    const records = buildMapTimerRecords(map, 1);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((entry) => entry.kind === 'metin')).toBe(true);
  });

  it('expands a metin type beyond catalog default with stable ids', () => {
    const map =
      respawnMaps.find((entry) => entry.key === 'Atlantyda V2') ??
      respawnMaps.find((entry) => entry.metins.some((m) => m.name.includes('Setao')))!;
    const types = listMetinTypes(map);
    const setao = types.find((entry) => entry.typeKey.includes('Setao')) ?? types[0]!;
    const overrides = setMetinSlotCount(
      {},
      map.key,
      setao.typeKey,
      setao.defaultCount + 2,
      setao.defaultCount,
    );
    const expanded = expandMapMetins(map, overrides);
    expect(expanded).toHaveLength(setao.defaultCount + 2);
    expect(expanded[0]?.name).toBe(setao.typeKey);
    expect(expanded[1]?.name).toBe(`${setao.typeKey} #2`);
    expect(expanded.at(-1)?.id).toContain('#');
  });

  it('keeps surviving slot timer state when count decreases', () => {
    const map = respawnMaps.find((entry) => entry.key === 'M2')!;
    const type = listMetinTypes(map)[0]!;
    const overrides = setMetinSlotCount({}, map.key, type.typeKey, 3, type.defaultCount);
    const blueprint = buildMapTimerRecords(map, 1, overrides);
    const first = blueprint.find((record) => record.entity.name.startsWith(type.typeKey))!;
    const previous = blueprint.map((record) =>
      record.key === first.key
        ? { ...record, confirmedAt: 123, confirmedBy: 'Mateusz', location: { x: 10, y: 20 } }
        : record,
    );
    const reduced = setMetinSlotCount(overrides, map.key, type.typeKey, 1, type.defaultCount);
    const nextBlueprint = buildMapTimerRecords(map, 1, reduced);
    const merged = mergeTimerRecordState(nextBlueprint, previous);
    const kept = merged.find((record) => record.key === first.key);
    expect(kept?.confirmedAt).toBe(123);
    expect(kept?.location).toEqual({ x: 10, y: 20 });
    expect(merged.filter((record) => record.entity.name.startsWith(type.typeKey))).toHaveLength(1);
  });
});
