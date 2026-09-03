import catalogDocument from './data/dobry-temat-respawn-catalog.json';

export type RespawnKind = 'boss' | 'metin';
export type RespawnPhase = 'no_data' | 'countdown' | 'window' | 'on_map' | 'expired';

export interface RespawnEntity {
  readonly id: string;
  readonly name: string;
  readonly respawnTimeMin: number;
  readonly respawnTimeMax: number;
  readonly hasWindow?: boolean;
  readonly windowTime?: number;
  readonly color?: string;
}

export interface RespawnMap {
  readonly key: string;
  readonly color?: string;
  readonly channels: number;
  readonly bosses: readonly RespawnEntity[];
  readonly metins: readonly RespawnEntity[];
}

export interface RespawnLocation {
  readonly x: number;
  readonly y: number;
}

export interface RespawnRecord {
  readonly key: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly kind: RespawnKind;
  readonly entity: RespawnEntity;
  readonly confirmedAt: number | null;
  readonly confirmedBy: string | null;
  readonly location: RespawnLocation | null;
}

export interface RespawnDisplay {
  readonly phase: RespawnPhase;
  readonly label: string;
  readonly clock: string;
  readonly minAt: number | null;
  readonly windowEndsAt: number | null;
  readonly clearsAt: number | null;
}

const MINUTE = 60_000;
const MAP_MARKER_LIFETIME = 5 * MINUTE;
const rawConfig = catalogDocument.config as Record<string, Omit<RespawnMap, 'key'>>;

export const respawnMaps: readonly RespawnMap[] = Object.entries(rawConfig)
  .filter(([, entry]) => Array.isArray(entry.bosses) || Array.isArray(entry.metins))
  .map(([key, entry]) => ({
    key,
    channels: Math.min(8, Math.max(1, entry.channels ?? 8)),
    bosses: entry.bosses ?? [],
    metins: entry.metins ?? [],
    ...(entry.color ? { color: entry.color } : {}),
  }));

export function respawnKey(
  kind: RespawnKind,
  mapKey: string,
  channel: number,
  entityId: string,
): string {
  return `${kind}-${mapKey}-ch${channel}-${entityId}`;
}

export function buildMapRespawnRecords(map: RespawnMap, channel: number): readonly RespawnRecord[] {
  return (['boss', 'metin'] as const).flatMap((kind) =>
    map[kind === 'boss' ? 'bosses' : 'metins'].map((entity) => ({
      key: respawnKey(kind, map.key, channel, entity.id),
      mapKey: map.key,
      channel,
      kind,
      entity,
      confirmedAt: null,
      confirmedBy: null,
      location: null,
    })),
  );
}

function formatDuration(milliseconds: number): string {
  const safe = Math.max(0, milliseconds);
  const minutes = Math.floor(safe / MINUTE);
  const seconds = Math.floor((safe % MINUTE) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Mirrors the old Wyprawa lifecycle: stable timer, respawn window, 5-minute map marker, then reset. */
export function getRespawnDisplay(record: RespawnRecord, now: number): RespawnDisplay {
  if (record.confirmedAt === null) {
    return {
      phase: 'no_data',
      label: 'Brak danych',
      clock: '--:--',
      minAt: null,
      windowEndsAt: null,
      clearsAt: null,
    };
  }

  const minAt = record.confirmedAt + record.entity.respawnTimeMin * MINUTE;
  const configuredMaxAt = record.confirmedAt + record.entity.respawnTimeMax * MINUTE;
  const configuredWindow =
    Math.max(0, record.entity.respawnTimeMax - record.entity.respawnTimeMin) * MINUTE;
  const explicitWindow = record.entity.hasWindow
    ? Math.max(0, record.entity.windowTime ?? 0) * MINUTE
    : 0;
  const metinGrace = record.kind === 'metin' && configuredWindow === 0 ? 5 * MINUTE : 0;
  const windowEndsAt = Math.max(configuredMaxAt, minAt + explicitWindow, minAt + metinGrace);
  const clearsAt = windowEndsAt + MAP_MARKER_LIFETIME;

  if (now < minAt)
    return {
      phase: 'countdown',
      label: 'Odliczanie',
      clock: formatDuration(configuredMaxAt - now),
      minAt,
      windowEndsAt,
      clearsAt,
    };
  if (now <= windowEndsAt)
    return {
      phase: 'window',
      label: 'Okno respawnu',
      clock: now < configuredMaxAt ? formatDuration(configuredMaxAt - now) : '00:00',
      minAt,
      windowEndsAt,
      clearsAt,
    };
  if (now <= clearsAt)
    return { phase: 'on_map', label: 'Na mapie', clock: 'NA MAPIE', minAt, windowEndsAt, clearsAt };
  return {
    phase: 'expired',
    label: 'Nieaktualne',
    clock: 'PO OKNIE',
    minAt,
    windowEndsAt,
    clearsAt,
  };
}

export function getRespawnPhase(record: RespawnRecord, now: number): RespawnPhase {
  return getRespawnDisplay(record, now).phase;
}
export function phaseLabel(phase: RespawnPhase): string {
  return {
    no_data: 'Brak danych',
    countdown: 'Odliczanie',
    window: 'Okno respawnu',
    on_map: 'Na mapie',
    expired: 'Nieaktualne',
  }[phase];
}
export function getRespawnClock(record: RespawnRecord, now: number): string {
  return getRespawnDisplay(record, now).clock;
}
export function canConfirmRespawn(record: RespawnRecord, now: number): boolean {
  const phase = getRespawnPhase(record, now);
  return phase === 'no_data' || phase === 'expired';
}
