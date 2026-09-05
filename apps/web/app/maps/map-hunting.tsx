'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { huntMapImagePath } from '../../src/hunt-map-assets';
import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  MAP_HUNT_SNAPSHOT_VERSION,
  type MapHuntSnapshotV1,
} from '../../src/hunt-snapshot';
import { loadHuntFieldsFromServer, putMapHuntField } from '../../src/player-team-field-sync';
import {
  confirmTimerKill,
  getOrCreateTimerRoom,
  type TimerRoomSnapshot,
} from '../../src/player-team-rooms-api';
import { huntStatusLabel, useHuntViewer, type HuntConnectionStatus } from '../../src/hunt-online';
import {
  canConfirmRespawn,
  channelsWithLateWindows,
  getRespawnDisplay,
  isWindowLatePhase,
  partitionRespawnRecords,
  respawnMaps,
  respawnWindowMinutes,
  type RespawnLocation,
  type RespawnRecord,
} from '../../src/respawn-timers';
import {
  METIN_COUNTS_STORAGE_KEY,
  MAX_METIN_SLOT_COUNT,
  MIN_METIN_SLOT_COUNT,
  buildMapTimerRecords,
  listMetinTypes,
  mergeTimerRecordState,
  parseMetinCountOverrides,
  resolveMetinSlotCount,
  setMetinSlotCount,
  type MetinCountOverrides,
} from '../../src/timers-metin-counts';
import { AppShell, Icon } from '../app-shell';
import styles from './map-hunting.module.css';

type Filter = 'all' | 'active';
type RecordStore = Record<string, readonly RespawnRecord[]>;

const filters: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'active', label: 'Okno / mapa' },
];
const MINI_MODE_STORAGE_KEY = 'destiled:timers-mini-mode:v1';
const TIMER_STATE_STORAGE_KEY = 'destiled:map-hunting-state:v2';


function MapPinGlyph({ scout = false }: { readonly scout?: boolean }) {
  return (
    <svg
      aria-hidden
      className={scout ? `${styles.pinGlyph} ${styles.pinGlyphScout}` : styles.pinGlyph}
      viewBox="0 0 24 36"
      width={scout ? 16 : 20}
      height={scout ? 24 : 30}
    >
      <path
        d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 8.2 10.5 22 10.5 22S22.5 20.2 22.5 12C22.5 6.2 17.8 1.5 12 1.5z"
        fill="currentColor"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.25"
      />
      <circle cx="12" cy="12" r="4" fill="#0a1018" />
    </svg>
  );
}

/** Mirror old RespTimer shouldMinimize: countdown pills stay compact until >=90% toward minAt. */
function shouldMinimizeCountdown(record: RespawnRecord, now: number): boolean {
  const display = getRespawnDisplay(record, now);
  if (display.phase !== 'countdown' || display.minAt === null || record.confirmedAt === null) {
    return false;
  }
  const span = display.minAt - record.confirmedAt;
  if (span <= 0) return false;
  const elapsedFraction = (now - record.confirmedAt) / span;
  return elapsedFraction < 0.9;
}

const scopeKey = (mapKey: string, channel: number) => `${mapKey}:ch${channel}`;
const formatWindow = (record: RespawnRecord) => {
  const span = respawnWindowMinutes(record.entity);
  if (record.entity.respawnTimeMin === record.entity.respawnTimeMax) {
    return `${record.entity.respawnTimeMin} min`;
  }
  return `${record.entity.respawnTimeMin}–${record.entity.respawnTimeMax} min${
    span > 0 ? ` · okno ${span} min` : ''
  }`;
};

function matchesFilter(record: RespawnRecord, filter: Filter, now: number): boolean {
  const phase = getRespawnDisplay(record, now).phase;
  return filter === 'all' || (filter === 'active' && (phase === 'window' || phase === 'on_map'));
}

function recordsForScope(
  map: (typeof respawnMaps)[number],
  channel: number,
  counts: MetinCountOverrides,
  store: RecordStore,
): readonly RespawnRecord[] {
  return mergeTimerRecordState(
    buildMapTimerRecords(map, channel, counts),
    store[scopeKey(map.key, channel)],
  );
}

export function MapHunting({
  initialSnapshot,
}: {
  readonly initialSnapshot: MapHuntingSnapshot;
}) {
  const [mapKey, setMapKey] = useState(respawnMaps[0]?.key ?? '');
  const map = respawnMaps.find((candidate) => candidate.key === mapKey) ?? respawnMaps[0];
  const [channel, setChannel] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [store, setStore] = useState<RecordStore>({});
  const [metinCounts, setMetinCounts] = useState<MetinCountOverrides>({});
  const [now, setNow] = useState(() => Date.now());
  const [pinModalKey, setPinModalKey] = useState<string | null>(null);
  const [modalDraftLocation, setModalDraftLocation] = useState<RespawnLocation | null>(null);
  const [notice, setNotice] = useState('');
  const [failedMapImages] = useState<readonly string[]>([]);
  const [miniMode, setMiniMode] = useState(false);
  const [expandedMiniKeys, setExpandedMiniKeys] = useState<readonly string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { viewerId, displayName, onlineEnabled, hydrated: storeHydrated } = useHuntViewer();
  const [connectionStatus, setConnectionStatus] = useState<HuntConnectionStatus>('offline');
  const [timerRoomRevision, setTimerRoomRevision] = useState<number | null>(null);
  const personalSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemoteRef = useRef(false);
  const scope = scopeKey(map?.key ?? '', channel);
  const records = map ? recordsForScope(map, channel, metinCounts, store) : [];
  const metinTypes = useMemo(() => (map ? listMetinTypes(map) : []), [map]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TIMER_STATE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RecordStore;
        const metinOnly: RecordStore = {};
        for (const [key, list] of Object.entries(parsed)) {
          if (!Array.isArray(list)) continue;
          metinOnly[key] = list.filter((record: { kind?: string } | null | undefined) => !!record && record.kind === 'metin');
        }
        setStore((current) => ({ ...current, ...metinOnly }));
      }
      const countsRaw = window.localStorage.getItem(METIN_COUNTS_STORAGE_KEY);
      if (countsRaw) setMetinCounts(parseMetinCountOverrides(JSON.parse(countsRaw)));
      setMiniMode(window.localStorage.getItem(MINI_MODE_STORAGE_KEY) === '1');
    } catch {
      /* keep defaults */
    } finally {
      setHydrated(true);
    }
  }, []);

  const applyMapHuntSnapshot = useCallback((snap: MapHuntSnapshotV1) => {
    applyingRemoteRef.current = true;
    if (snap.mapKey) setMapKey(snap.mapKey);
    if (snap.channel) setChannel(snap.channel);
    if (snap.filter) setFilter(snap.filter);
    setMiniMode(snap.miniMode === true);
    setMetinCounts(snap.metinCounts);
    const metinOnly: RecordStore = {};
    for (const [key, list] of Object.entries(snap.store)) {
      metinOnly[key] = list.filter((record: { kind?: string } | null | undefined) => !!record && record.kind === 'metin');
    }
    setStore((current) => ({ ...current, ...metinOnly }));
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, []);

  const applyTimerRoom = useCallback((room: TimerRoomSnapshot) => {
    setTimerRoomRevision(room.revision);
    const roomScope = scopeKey(room.mapKey, room.channel);
    const remoteList: RespawnRecord[] = Object.values(room.timers).map((t) => ({
      key: t.key,
      mapKey: t.mapKey,
      channel: t.channel,
      kind: t.kind,
      entity: {
        id: t.key,
        name: t.entityName ?? t.key,
        respawnTimeMin: 5,
        respawnTimeMax: 10,
      },
      confirmedAt: t.confirmedAt,
      confirmedBy: t.confirmedBy,
      location: t.location,
    }));
    const mapDef = respawnMaps.find((m) => m.key === room.mapKey);
    if (!mapDef) return;
    setStore((current) => {
      const base = buildMapTimerRecords(mapDef, room.channel, metinCounts);
      const merged = mergeTimerRecordState(base, remoteList);
      return { ...current, [roomScope]: merged };
    });
  }, [metinCounts]);

  // Personal mapHunt from /me/state on enter.
  useEffect(() => {
    if (!hydrated || !storeHydrated) return;
    if (!onlineEnabled || !viewerId) {
      setConnectionStatus('offline');
      return;
    }
    let cancelled = false;
    setConnectionStatus('connecting');
    void (async () => {
      const loaded = await loadHuntFieldsFromServer({ viewerId });
      if (cancelled) return;
      if (!loaded.ok) {
        setConnectionStatus('error');
        return;
      }
      if (loaded.mapHunt) applyMapHuntSnapshot(loaded.mapHunt);
      setConnectionStatus('online');
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMapHuntSnapshot, hydrated, onlineEnabled, storeHydrated, viewerId]);

  // Poll shared timer room for current map+channel.
  useEffect(() => {
    if (!hydrated || !onlineEnabled || !viewerId || !map) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const room = await getOrCreateTimerRoom({
          viewerId,
          mapKey: map.key,
          channel,
        });
        if (cancelled) return;
        applyTimerRoom(room);
        setConnectionStatus('online');
      } catch {
        if (!cancelled) setConnectionStatus((s) => (s === 'online' ? 'error' : s));
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyTimerRoom, channel, hydrated, map, onlineEnabled, viewerId]);

  // Persist personal mapHunt (prefs + offline cache) via GET→merge→PUT.
  useEffect(() => {
    if (!hydrated || applyingRemoteRef.current) return;
    if (!onlineEnabled || !viewerId || !map) return;
    if (personalSyncTimerRef.current) clearTimeout(personalSyncTimerRef.current);
    personalSyncTimerRef.current = setTimeout(() => {
      const snap: MapHuntSnapshotV1 = {
        version: MAP_HUNT_SNAPSHOT_VERSION,
        mapKey: map.key,
        channel,
        filter,
        miniMode,
        store,
        metinCounts,
        updatedAtIso: new Date().toISOString(),
      };
      void putMapHuntField({ viewerId, mapHunt: snap }).then((result) => {
        setConnectionStatus(result.ok ? 'online' : 'error');
      });
    }, 600);
    return () => {
      if (personalSyncTimerRef.current) clearTimeout(personalSyncTimerRef.current);
    };
  }, [channel, filter, hydrated, map, metinCounts, miniMode, onlineEnabled, store, viewerId]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(TIMER_STATE_STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore quota */
    }
  }, [hydrated, store]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(METIN_COUNTS_STORAGE_KEY, JSON.stringify(metinCounts));
    } catch {
      /* ignore quota */
    }
  }, [hydrated, metinCounts]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(MINI_MODE_STORAGE_KEY, miniMode ? '1' : '0');
    } catch {
      /* ignore quota */
    }
  }, [hydrated, miniMode]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const mapRecordsFlat = useMemo(() => {
    if (!map) return [] as RespawnRecord[];
    const collected: RespawnRecord[] = [];
    for (let ch = 1; ch <= map.channels; ch += 1) {
      collected.push(...recordsForScope(map, ch, metinCounts, store));
    }
    return collected;
  }, [map, metinCounts, store]);

  const lateChannels = useMemo(
    () => channelsWithLateWindows(mapRecordsFlat, map?.key ?? '', now),
    [map?.key, mapRecordsFlat, now],
  );

  const filtered = useMemo(
    () => records.filter((record) => matchesFilter(record, filter, now)),
    [filter, now, records],
  );
  const { available, counting } = useMemo(() => {
    const parts = partitionRespawnRecords(filtered, now);
    const rank = (record: RespawnRecord) => {
      const phase = getRespawnDisplay(record, now).phase;
      if (isWindowLatePhase(record, now)) return 0;
      if (phase === 'window') return 1;
      if (phase === 'on_map') return 2;
      if (phase === 'expired') return 3;
      return 4;
    };
    return {
      available: [...parts.available].sort((left, right) => rank(left) - rank(right)),
      counting: parts.counting,
    };
  }, [filtered, now]);
  const activeTimerCount = useMemo(
    () =>
      records.filter((record) =>
        ['countdown', 'window', 'on_map'].includes(getRespawnDisplay(record, now).phase),
      ).length,
    [now, records],
  );
  const currentMapImage = huntMapImagePath(map?.key ?? '');
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(map?.key ?? '');
  const modalRecord = records.find((record) => record.key === pinModalKey) ?? null;

  const updateCurrentScope = (
    updater: (current: readonly RespawnRecord[]) => readonly RespawnRecord[],
  ) => {
    if (!map) return;
    setStore((current) => ({
      ...current,
      [scope]: updater(recordsForScope(map, channel, metinCounts, current)),
    }));
  };
  const changeMetinCount = (typeKey: string, nextCount: number, defaultCount: number) => {
    if (!map) return;
    const nextCounts = setMetinSlotCount(metinCounts, map.key, typeKey, nextCount, defaultCount);
    setMetinCounts(nextCounts);
    setStore((current) => {
      const next: Record<string, readonly RespawnRecord[]> = { ...current };
      for (let ch = 1; ch <= map.channels; ch += 1) {
        const key = scopeKey(map.key, ch);
        const allowed = new Set(buildMapTimerRecords(map, ch, nextCounts).map((record) => record.key));
        const existing = current[key];
        if (!existing) continue;
        next[key] = existing.filter((record) => allowed.has(record.key));
      }
      return next;
    });
  };
  const changeMap = (nextMapKey: string) => {
    setMapKey(nextMapKey);
    setChannel(1);
    setPinModalKey(null);
    setModalDraftLocation(null);
  };
  const changeChannel = (nextChannel: number) => {
    setChannel(nextChannel);
    setPinModalKey(null);
    setModalDraftLocation(null);
  };
  const confirmKilled = (recordKey: string, location: RespawnLocation | null) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, Date.now())) {
      setNotice(
        'Ten punkt jest w odliczaniu. Kolejne zbicie odblokuje się dopiero w oknie respawnu.',
      );
      return;
    }
    const confirmedAt = Date.now();
    const nextLocation = location ?? target.location;
    const actor = displayName || initialSnapshot.viewerName;
    updateCurrentScope((current) =>
      current.map((record) =>
        record.key === recordKey
          ? {
              ...record,
              confirmedAt,
              confirmedBy: actor,
              location: nextLocation,
            }
          : record,
      ),
    );
    setPinModalKey(null);
    setModalDraftLocation(null);
    setNotice(
      location
        ? 'Zbicie zapisane. Pinezka = ostatnia znana lokalizacja. Timer zjechał na listę odliczań.'
        : 'Zbicie zapisane. Timer zjechał na listę odliczań (bez nowej pinezki).',
    );

    if (onlineEnabled && viewerId && map) {
      const operationId = `kill:${recordKey}:${confirmedAt}`;
      void confirmTimerKill({
        viewerId,
        mapKey: map.key,
        channel,
        record: {
          key: target.key,
          mapKey: target.mapKey,
          channel: target.channel,
          kind: target.kind,
          entityName: target.entity.name,
          confirmedAt,
          confirmedBy: actor,
          location: nextLocation,
          operationId,
        },
        operationId,
        expectedRevision: timerRoomRevision,
      })
        .then((room) => {
          applyTimerRoom(room);
          setConnectionStatus('online');
        })
        .catch(() => setConnectionStatus('error'));
    }
  };
  const openKillModal = (recordKey: string) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, now)) return;
    setPinModalKey(recordKey);
    setModalDraftLocation(null);
    setNotice('Zaznacz pinezkę na mini-mapie albo zapisz zbicie bez pinezki.');
  };
  const placeOnModalMap = (event: MouseEvent<HTMLDivElement>) => {
    if (!pinModalKey) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setModalDraftLocation({
      x: Math.max(
        0,
        Math.min(100, Math.round(((event.clientX - bounds.left) / bounds.width) * 1_000) / 10),
      ),
      y: Math.max(
        0,
        Math.min(100, Math.round(((event.clientY - bounds.top) / bounds.height) * 1_000) / 10),
      ),
    });
  };

  const renderRecord = (record: RespawnRecord, countingDown: boolean) => {
    const display = getRespawnDisplay(record, now);
    const canConfirm = canConfirmRespawn(record, now);
    const late = isWindowLatePhase(record, now);
    const inWindow = display.phase === 'window';
    const minimized =
      miniMode &&
      countingDown &&
      shouldMinimizeCountdown(record, now) &&
      !expandedMiniKeys.includes(record.key);
    return (
      <article
        className={`respawn-record is-${display.phase}${countingDown ? ' is-counting' : ''}${
          inWindow ? ' is-window-active' : ''
        }${late ? ' is-late-window' : ''}${minimized ? ' is-minimized' : ''}`}
        key={record.key}
        onClick={
          minimized
            ? () =>
                setExpandedMiniKeys((current) =>
                  current.includes(record.key) ? current : [...current, record.key],
                )
            : undefined
        }
        role={minimized ? 'button' : undefined}
        tabIndex={minimized ? 0 : undefined}
      >
        <span className="respawn-record-icon" style={{ color: record.entity.color ?? undefined }}>
          {record.entity.iconPath ? (
            <img alt="" className="respawn-entity-icon" src={record.entity.iconPath} />
          ) : (
            <Icon name="map" size={17} />
          )}
        </span>
        <div className="respawn-record-copy">
          <strong>{record.entity.name}</strong>
          {!minimized ? (
            <span>
              <em className="respawn-window-chip">{formatWindow(record)}</em>
              Metin · CH{record.channel}
              {record.location
                ? ` · pinezka ${Math.round(record.location.x)}/${Math.round(record.location.y)}`
                : ' · bez pinezki'}
              {record.confirmedBy ? ` · zgłosił ${record.confirmedBy}` : ''}
              {late ? ' · ostatnie 20% okna' : inWindow ? ' · w oknie' : ''}
            </span>
          ) : null}
        </div>
        <div className="respawn-record-time">
          <b>{display.clock}</b>
          {!minimized ? (
            <span>
              {countingDown
                ? `Do okna · ${display.label}`
                : late
                  ? `Końcówka okna · ${display.clock}`
                  : display.label}
            </span>
          ) : null}
        </div>
        {!minimized ? (
          <div className="respawn-record-actions">
            <button disabled={!canConfirm} onClick={() => openKillModal(record.key)} type="button">
              {canConfirm ? 'Zbite' : 'Odliczanie'}
            </button>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <AppShell activeSection="timers" viewerName={displayName || initialSnapshot.viewerName}>
      <main className={`respawn-page ${styles.root}${miniMode ? ' is-mini' : ''}`} id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Timery</h1>
            {!miniMode ? (
              <p>
                Mapa + respawn z katalogu. <b>Zbite</b> otwiera mini-mapę pinezki. Zbity cel
                zjeżdża na dół z odliczaniem. Gdy okno wchodzi w ostatnie 20% na innym kanale —
                ten CH się podświetla.
              </p>
            ) : (
              <p className="respawn-mini-lead">
                {map?.key} · CH{channel} · mini okno
              </p>
            )}
          </div>
          <div className="respawn-header-actions">
            <span
              className={`respawn-sync-status is-${connectionStatus}`}
              data-testid="timers-sync-status"
              title={viewerId ? `viewer ${viewerId}` : 'Brak demo viewer id — tylko lokalnie'}
            >
              {huntStatusLabel(connectionStatus)}
            </span>
            <button
              aria-pressed={miniMode}
              className={miniMode ? 'is-active' : ''}
              data-testid="mini-mode-btn"
              onClick={() => setMiniMode((current) => !current)}
              title={miniMode ? 'Widok pełny' : 'Mini okno'}
              type="button"
            >
              {miniMode ? 'Widok pełny' : 'Mini okno'}
            </button>
          </div>
        </header>
        <section className="respawn-controls panel">
          <div className="respawn-map-select">
            <label htmlFor="respawn-map">Mapa</label>
            <select
              id="respawn-map"
              onChange={(event) => changeMap(event.target.value)}
              value={map?.key ?? ''}
            >
              {respawnMaps.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.key}
                </option>
              ))}
            </select>
          </div>
          <div className="respawn-channel-select">
            <span>Aktywny kanał</span>
            <div className="respawn-channels">
              {Array.from({ length: map?.channels ?? 0 }, (_, index) => index + 1).map((value) => (
                <button
                  aria-pressed={value === channel}
                  className={`${value === channel ? 'is-active' : ''}${
                    lateChannels.includes(value) ? ' is-late-channel' : ''
                  }`}
                  key={value}
                  onClick={() => changeChannel(value)}
                  title={
                    lateChannels.includes(value)
                      ? 'Na tym kanale timer wchodzi w ostatnie 20% okna'
                      : undefined
                  }
                  type="button"
                >
                  CH{value}
                </button>
              ))}
            </div>
          </div>
          {!miniMode && metinTypes.length > 0 ? (
            <div className={styles.metinCounts} data-testid="metin-counts">
              <span className={styles.metinCountsLabel}>Liczba metinów</span>
              <div className={styles.metinCountsList}>
                {metinTypes.map((definition) => {
                  const count = resolveMetinSlotCount(definition, metinCounts, map?.key ?? '');
                  return (
                    <div className={styles.metinCountRow} key={definition.typeKey}>
                      <span className={styles.metinCountName} title={definition.label}>
                        {definition.label}
                      </span>
                      <div className={styles.metinCountControls}>
                        <button
                          aria-label={`Mniej: ${definition.label}`}
                          disabled={count <= MIN_METIN_SLOT_COUNT}
                          onClick={() =>
                            changeMetinCount(definition.typeKey, count - 1, definition.defaultCount)
                          }
                          type="button"
                        >
                          −
                        </button>
                        <input
                          aria-label={`Liczba: ${definition.label}`}
                          max={MAX_METIN_SLOT_COUNT}
                          min={MIN_METIN_SLOT_COUNT}
                          onChange={(event) =>
                            changeMetinCount(
                              definition.typeKey,
                              Number(event.target.value),
                              definition.defaultCount,
                            )
                          }
                          type="number"
                          value={count}
                        />
                        <button
                          aria-label={`Więcej: ${definition.label}`}
                          disabled={count >= MAX_METIN_SLOT_COUNT}
                          onClick={() =>
                            changeMetinCount(definition.typeKey, count + 1, definition.defaultCount)
                          }
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="respawn-controls-stat">
            <strong>{records.length}</strong>
            <span>timerów na tej mapie</span>
          </div>
          <div className="respawn-controls-stat">
            <strong>{activeTimerCount}</strong>
            <span>aktywnych timerów</span>
          </div>
        </section>
        {lateChannels.length > 0 && !lateChannels.includes(channel) ? (
          <p className="respawn-late-banner" role="status">
            Okno w ostatnich 20%: podświetlone{' '}
            {lateChannels.map((value) => `CH${value}`).join(', ')} — przełącz kanał, jeśli chcesz
            zdążyć.
          </p>
        ) : null}
        <section className="respawn-workspace is-timers-only">
          <div className="panel respawn-main-panel">
            <header className="respawn-list-header">
              <div>
                <span className="section-kicker">
                  {map?.key} · CH{channel}
                </span>
                <h2>Lista timerów</h2>
                {!miniMode ? (
                  <p className="respawn-list-lead">
                    {available.length} dostępnych · {counting.length} w odliczaniu · pinezka =
                    ostatnie zbicie
                  </p>
                ) : null}
                {miniMode ? (
                  <p className="respawn-list-lead">
                    {available.length} dostępnych · {counting.length} odliczań
                  </p>
                ) : null}
              </div>
              <div className="respawn-filters">
                {filters.map((item) => (
                  <button
                    aria-pressed={filter === item.id}
                    className={filter === item.id ? 'is-active' : ''}
                    key={item.id}
                    onClick={() => setFilter(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="respawn-records">
              {available.map((record) => renderRecord(record, false))}
              {counting.length > 0 ? (
                <div className="respawn-counting-block">
                  <header>
                    <span className="section-kicker">Po zbiciu</span>
                    <h3>{miniMode ? 'Odliczanie' : 'Odliczanie — cel nie znika'}</h3>
                    {!miniMode ? (
                      <p>
                        Zbite cele zjeżdżają tu z zegarem do okna respawnu. Ponowne <b>Zbite</b>{' '}
                        dopiero gdy otworzy się okno.
                      </p>
                    ) : null}
                  </header>
                  {counting.map((record) => renderRecord(record, true))}
                </div>
              ) : null}
              {available.length === 0 && counting.length === 0 ? (
                <p className="respawn-empty">Brak timerów w tym filtrze.</p>
              ) : null}
            </div>
          </div>
        </section>
        <p aria-live="polite" className="respawn-notice">
          {notice}
        </p>
        {!miniMode ? (
          <p className="respawn-data-note">
            Timery metinów — katalog dump dobry-temat.{' '}
            {connectionStatus === 'online'
              ? 'Wspólny pokój mapy/CH przez player-team (poll). localStorage = cache offline.'
              : 'Tryb lokalny / offline — localStorage jako cache.'}
          </p>
        ) : null}

        {modalRecord ? (
          <div
            aria-modal="true"
            className="respawn-pin-modal"
            role="dialog"
            aria-labelledby="respawn-pin-modal-title"
          >
            <div className="respawn-pin-modal-card">
              <header>
                <div>
                  <span className="section-kicker">Potwierdź zbicie</span>
                  <h2 id="respawn-pin-modal-title">{modalRecord.entity.name}</h2>
                  <p>
                    Kliknij mini-mapę, żeby zostawić pinezkę ostatniej lokalizacji — albo pomiń.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPinModalKey(null);
                    setModalDraftLocation(null);
                  }}
                  type="button"
                >
                  Anuluj
                </button>
              </header>
              <div
                aria-label="Mini-mapa pinezki zbicia"
                className="respawn-map-stage respawn-pin-modal-map is-placing"
                onClick={placeOnModalMap}
                role="button"
                tabIndex={0}
              >
                {canShowMapImage ? (
                  <img alt="" src={currentMapImage} />
                ) : (
                  <div
                    className={`respawn-map-atlas ${styles.atlas}`}
                    style={{ '--map-accent': map?.color ?? '#3d7ea6' } as CSSProperties}
                  >
                    <div className={styles.atlasGrid} aria-hidden />
                    <div className={styles.atlasCopy}>
                      <strong>{map?.key}</strong>
                      <span>CH{channel}</span>
                    </div>
                  </div>
                )}
                {modalDraftLocation ? (
                  <span
                    className="respawn-map-marker respawn-map-pin is-metin is-selected"
                    style={{
                      left: `${modalDraftLocation.x}%`,
                      top: `${modalDraftLocation.y}%`,
                    }}
                  >
                    <MapPinGlyph />
                  </span>
                ) : null}
              </div>
              <footer className="respawn-pin-modal-actions">
                <button onClick={() => confirmKilled(modalRecord.key, null)} type="button">
                  Zbite bez pinezki
                </button>
                <button
                  className="is-primary"
                  disabled={!modalDraftLocation}
                  onClick={() =>
                    modalDraftLocation
                      ? confirmKilled(modalRecord.key, modalDraftLocation)
                      : undefined
                  }
                  type="button"
                >
                  Zapisz zbicie + pinezkę
                </button>
              </footer>
            </div>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
