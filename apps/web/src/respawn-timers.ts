import catalogDocument from './data/dobry-temat-respawn-catalog.json';

export type RespawnKind = 'boss' | 'metin';
export type RespawnPhase = 'no_data' | 'killed_recently' | 'waiting' | 'approaching' | 'window' | 'on_map' | 'expired';

export interface RespawnEntity { readonly id: string; readonly name: string; readonly respawnTimeMin: number; readonly respawnTimeMax: number; readonly color?: string; }
export interface RespawnMap { readonly key: string; readonly color?: string; readonly channels: number; readonly bosses: readonly RespawnEntity[]; readonly metins: readonly RespawnEntity[]; }
export interface RespawnRecord { readonly key: string; readonly mapKey: string; readonly channel: number; readonly kind: RespawnKind; readonly entity: RespawnEntity; readonly confirmedAt: number | null; readonly confirmedBy: string | null; }

const rawConfig = catalogDocument.config as Record<string, Omit<RespawnMap, 'key'>>;
export const respawnMaps: readonly RespawnMap[] = Object.entries(rawConfig)
  .filter(([, entry]) => Array.isArray(entry.bosses) || Array.isArray(entry.metins))
  .map(([key, entry]) => ({ key, channels: Math.min(8, Math.max(1, entry.channels ?? 8)), bosses: entry.bosses ?? [], metins: entry.metins ?? [], ...(entry.color ? { color: entry.color } : {}) }));

export function respawnKey(kind: RespawnKind, mapKey: string, channel: number, entityId: string): string { return kind + '-' + mapKey + '-ch' + channel + '-' + entityId; }
export function buildMapRespawnRecords(map: RespawnMap, channel: number): readonly RespawnRecord[] {
  return (['boss', 'metin'] as const).flatMap((kind) => map[kind === 'boss' ? 'bosses' : 'metins'].map((entity) => ({ key: respawnKey(kind, map.key, channel, entity.id), mapKey: map.key, channel, kind, entity, confirmedAt: null, confirmedBy: null })));
}
export function getRespawnPhase(record: RespawnRecord, now: number): RespawnPhase {
  if (!record.confirmedAt) return 'no_data';
  const elapsed = now - record.confirmedAt; const minMs = record.entity.respawnTimeMin * 60_000; const maxMs = record.entity.respawnTimeMax * 60_000;
  if (elapsed < Math.min(120_000, minMs * 0.1)) return 'killed_recently';
  if (elapsed < minMs - 5 * 60_000) return 'waiting';
  if (elapsed < minMs) return 'approaching';
  if (elapsed <= maxMs) return 'window';
  if (elapsed <= maxMs + 5 * 60_000) return 'on_map';
  return 'expired';
}
export function phaseLabel(phase: RespawnPhase): string { return { no_data: 'Brak danych', killed_recently: 'Zbite', waiting: 'Jeszcze za wcześnie', approaching: 'Zbliża się okno', window: 'Okno respawnu', on_map: 'Na mapie', expired: 'Nieaktualne' }[phase]; }
