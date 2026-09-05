import {
  respawnKey,
  type RespawnEntity,
  type RespawnMap,
  type RespawnRecord,
} from './respawn-timers';

function baseMetinName(name: string): string {
  return name.replace(/\s*#\d+\s*$/u, '').trim();
}

/** localStorage key for per-map metin slot counts on Timers. */
export const METIN_COUNTS_STORAGE_KEY = 'destiled:timers-metin-counts:v1';
export const MIN_METIN_SLOT_COUNT = 1;
export const MAX_METIN_SLOT_COUNT = 20;

/** mapKey -> metin base name -> slot count */
export type MetinCountOverrides = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface MetinTypeDefinition {
  readonly typeKey: string;
  readonly label: string;
  readonly defaultCount: number;
  readonly template: RespawnEntity;
  readonly catalogEntries: readonly RespawnEntity[];
}

function clampMetinCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_METIN_SLOT_COUNT, Math.max(MIN_METIN_SLOT_COUNT, Math.round(value)));
}

/** Group catalog metins by base name, preserving first-seen order. */
export function listMetinTypes(map: RespawnMap): readonly MetinTypeDefinition[] {
  const groups = new Map<string, RespawnEntity[]>();
  for (const entity of map.metins) {
    const typeKey = baseMetinName(entity.name);
    const bucket = groups.get(typeKey);
    if (bucket) bucket.push(entity);
    else groups.set(typeKey, [entity]);
  }
  return [...groups.entries()].map(([typeKey, catalogEntries]) => ({
    typeKey,
    label: typeKey,
    defaultCount: catalogEntries.length,
    template: catalogEntries[0]!,
    catalogEntries,
  }));
}

export function resolveMetinSlotCount(
  definition: MetinTypeDefinition,
  overrides: MetinCountOverrides,
  mapKey: string,
): number {
  const raw = overrides[mapKey]?.[definition.typeKey];
  return clampMetinCount(
    typeof raw === 'number' ? raw : definition.defaultCount,
    definition.defaultCount,
  );
}

function slotEntityName(baseName: string, slotIndex: number): string {
  return slotIndex <= 1 ? baseName : `${baseName} #${slotIndex}`;
}

function slotEntityId(
  templateId: string,
  catalogEntry: RespawnEntity | undefined,
  slotIndex: number,
): string {
  if (catalogEntry) return catalogEntry.id;
  return slotIndex <= 1 ? templateId : `${templateId}#${slotIndex}`;
}

/** Expand catalog metins using per-type slot overrides (Timers only). */
export function expandMapMetins(
  map: RespawnMap,
  overrides: MetinCountOverrides = {},
): readonly RespawnEntity[] {
  const expanded: RespawnEntity[] = [];
  for (const definition of listMetinTypes(map)) {
    const count = resolveMetinSlotCount(definition, overrides, map.key);
    for (let slot = 1; slot <= count; slot += 1) {
      const catalogEntry = definition.catalogEntries[slot - 1];
      const source = catalogEntry ?? definition.template;
      expanded.push({
        ...source,
        id: slotEntityId(definition.template.id, catalogEntry, slot),
        name: slotEntityName(definition.typeKey, slot),
      });
    }
  }
  return expanded;
}

/** Timers entity list: metins only. Bosses never included. */
export function buildMapTimerRecords(
  map: RespawnMap,
  channel: number,
  overrides: MetinCountOverrides = {},
): readonly RespawnRecord[] {
  return expandMapMetins(map, overrides).map((entity) => ({
    key: respawnKey('metin', map.key, channel, entity.id),
    mapKey: map.key,
    channel,
    kind: 'metin' as const,
    entity,
    confirmedAt: null,
    confirmedBy: null,
    location: null,
  }));
}

export function mergeTimerRecordState(
  blueprint: readonly RespawnRecord[],
  previous: readonly RespawnRecord[] | undefined,
): readonly RespawnRecord[] {
  if (!previous || previous.length === 0) return blueprint;
  const byKey = new Map(previous.map((record) => [record.key, record]));
  return blueprint.map((record) => {
    const saved = byKey.get(record.key);
    if (!saved) return record;
    return {
      ...record,
      confirmedAt: saved.confirmedAt,
      confirmedBy: saved.confirmedBy,
      location: saved.location,
    };
  });
}

export function parseMetinCountOverrides(raw: unknown): MetinCountOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, Record<string, number>> = {};
  for (const [mapKey, types] of Object.entries(raw as Record<string, unknown>)) {
    if (!types || typeof types !== 'object') continue;
    const nextTypes: Record<string, number> = {};
    for (const [typeKey, value] of Object.entries(types as Record<string, unknown>)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      nextTypes[typeKey] = clampMetinCount(value, MIN_METIN_SLOT_COUNT);
    }
    if (Object.keys(nextTypes).length > 0) result[mapKey] = nextTypes;
  }
  return result;
}

export function setMetinSlotCount(
  overrides: MetinCountOverrides,
  mapKey: string,
  typeKey: string,
  nextCount: number,
  defaultCount: number,
): MetinCountOverrides {
  const clamped = clampMetinCount(nextCount, defaultCount);
  const mapCounts = { ...(overrides[mapKey] ?? {}) };
  if (clamped === defaultCount) delete mapCounts[typeKey];
  else mapCounts[typeKey] = clamped;
  const next: Record<string, Record<string, number>> = { ...overrides };
  if (Object.keys(mapCounts).length === 0) delete next[mapKey];
  else next[mapKey] = mapCounts;
  return next;
}