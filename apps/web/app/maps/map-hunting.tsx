'use client';

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';

import { huntMapImagePath } from '../../src/hunt-map-assets';
import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  buildMapRespawnRecords,
  canConfirmRespawn,
  channelsWithLateWindows,
  getRespawnDisplay,
  isWindowLatePhase,
  partitionRespawnRecords,
  respawnMaps,
  respawnWindowMinutes,
  type RespawnKind,
  type RespawnLocation,
  type RespawnRecord,
} from '../../src/respawn-timers';
import { AppShell, Icon } from '../app-shell';
import styles from './map-hunting.module.css';

type Filter = 'all' | RespawnKind | 'active';
type View = 'timers' | 'map';
type RecordStore = Record<string, readonly RespawnRecord[]>;

const filters: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'boss', label: 'Bossy' },
  { id: 'metin', label: 'Metiny' },
  { id: 'active', label: 'Okno / mapa' },
];
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

function initialStore(): RecordStore {
  const first = respawnMaps[0];
  return first ? { [scopeKey(first.key, 1)]: buildMapRespawnRecords(first, 1) } : {};
}

function matchesFilter(record: RespawnRecord, filter: Filter, now: number): boolean {
  const phase = getRespawnDisplay(record, now).phase;
  return (
    filter === 'all' ||
    record.kind === filter ||
    (filter === 'active' && (phase === 'window' || phase === 'on_map'))
  );
}

export function MapHunting({
  initialSnapshot,
  initialView = 'timers',
}: {
  readonly initialSnapshot: MapHuntingSnapshot;
  readonly initialView?: View;
}) {
  const [mapKey, setMapKey] = useState(respawnMaps[0]?.key ?? '');
  const map = respawnMaps.find((candidate) => candidate.key === mapKey) ?? respawnMaps[0];
  const [channel, setChannel] = useState(1);
  const [view, setView] = useState<View>(initialView);
  const [filter, setFilter] = useState<Filter>('all');
  const [store, setStore] = useState<RecordStore>(initialStore);
  const [now, setNow] = useState(() => Date.now());
  const [pinModalKey, setPinModalKey] = useState<string | null>(null);
  const [modalDraftLocation, setModalDraftLocation] = useState<RespawnLocation | null>(null);
  const [notice, setNotice] = useState('');
  const [failedMapImages, setFailedMapImages] = useState<readonly string[]>([]);
  const scope = scopeKey(map?.key ?? '', channel);
  const records = store[scope] ?? (map ? buildMapRespawnRecords(map, channel) : []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('destiled:map-hunting-state:v2');
      if (raw) setStore((current) => ({ ...current, ...(JSON.parse(raw) as RecordStore) }));
    } catch {
      /* keep the fixture */
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem('destiled:map-hunting-state:v2', JSON.stringify(store));
  }, [store]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const mapRecordsFlat = useMemo(() => {
    if (!map) return [] as RespawnRecord[];
    const collected: RespawnRecord[] = [];
    for (let ch = 1; ch <= map.channels; ch += 1) {
      const key = scopeKey(map.key, ch);
      collected.push(...(store[key] ?? buildMapRespawnRecords(map, ch)));
    }
    return collected;
  }, [map, store]);

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
  const mapPins = useMemo(() => records.filter((record) => record.location !== null), [records]);
  const currentMapImage = huntMapImagePath(map?.key ?? '');
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(map?.key ?? '');
  const modalRecord = records.find((record) => record.key === pinModalKey) ?? null;

  const updateCurrentScope = (
    updater: (current: readonly RespawnRecord[]) => readonly RespawnRecord[],
  ) => {
    if (!map) return;
    setStore((current) => ({
      ...current,
      [scope]: updater(current[scope] ?? buildMapRespawnRecords(map, channel)),
    }));
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
    updateCurrentScope((current) =>
      current.map((record) =>
        record.key === recordKey
          ? {
              ...record,
              confirmedAt,
              confirmedBy: initialSnapshot.viewerName,
              location: location ?? record.location,
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
    return (
      <article
        className={`respawn-record is-${display.phase}${countingDown ? ' is-counting' : ''}${
          inWindow ? ' is-window-active' : ''
        }${late ? ' is-late-window' : ''}`}
        key={record.key}
      >
        <span className="respawn-record-icon" style={{ color: record.entity.color ?? undefined }}>
          {record.entity.iconPath ? (
            <img alt="" className="respawn-entity-icon" src={record.entity.iconPath} />
          ) : (
            <Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={17} />
          )}
        </span>
        <div className="respawn-record-copy">
          <strong>{record.entity.name}</strong>
          <span>
            <em className="respawn-window-chip">{formatWindow(record)}</em>
            {record.kind === 'boss' ? 'Boss' : 'Metin'} · CH{record.channel}
            {record.location
              ? ` · pinezka ${Math.round(record.location.x)}/${Math.round(record.location.y)}`
              : ' · bez pinezki'}
            {record.confirmedBy ? ` · zgłosił ${record.confirmedBy}` : ''}
            {late ? ' · ostatnie 20% okna' : inWindow ? ' · w oknie' : ''}
          </span>
        </div>
        <div className="respawn-record-time">
          <b>{display.clock}</b>
          <span>
            {countingDown
              ? `Do okna · ${display.label}`
              : late
                ? `Końcówka okna · ${display.clock}`
                : display.label}
          </span>
        </div>
        <div className="respawn-record-actions">
          <button disabled={!canConfirm} onClick={() => openKillModal(record.key)} type="button">
            {canConfirm ? 'Zbite' : 'Odliczanie'}
          </button>
        </div>
      </article>
    );
  };

  return (
    <AppShell activeSection="timers" viewerName={initialSnapshot.viewerName}>
      <main className="respawn-page" id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Timery</h1>
            <p>
              Osobny system od Party i EQ: mapa + respawn z katalogu. <b>Zbite</b> otwiera mini-mapę
              pinezki. Zbity cel zjeżdża na dół z odliczaniem. Gdy okno wchodzi w ostatnie 20% na
              innym kanale — ten CH się podświetla.
            </p>
          </div>
          <div className="respawn-header-actions">
            <div role="tablist" aria-label="Widok timerów">
              <button
                aria-selected={view === 'timers'}
                className={view === 'timers' ? 'is-active' : ''}
                onClick={() => setView('timers')}
                role="tab"
                type="button"
              >
                Timery
              </button>
              <button
                aria-selected={view === 'map'}
                className={view === 'map' ? 'is-active' : ''}
                onClick={() => setView('map')}
                role="tab"
                type="button"
              >
                Atlas mapy
              </button>
            </div>
            <a className="respawn-party-toggle" href="/maps">
              <span /> Party (osobny system)
            </a>
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
        <section className={`respawn-workspace${view === 'timers' ? ' is-timers-only' : ''}`}>
          <div className="panel respawn-main-panel">
            <header className="respawn-list-header">
              <div>
                <span className="section-kicker">
                  {map?.key} · CH{channel}
                </span>
                <h2>{view === 'map' ? 'Atlas i pinezki' : 'Lista timerów'}</h2>
                {view === 'timers' ? (
                  <p className="respawn-list-lead">
                    {available.length} dostępnych · {counting.length} w odliczaniu · pinezka =
                    ostatnie zbicie (nie skaut Party)
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
            {view === 'map' && (
              <div className="respawn-map-stage-wrap">
                <div aria-label="Mapa z ostatnimi lokalizacjami" className="respawn-map-stage">
                  {canShowMapImage ? (
                    <img
                      alt={`Mapa ${map?.key ?? ''}`}
                      onError={() =>
                        setFailedMapImages((current) =>
                          current.includes(map?.key ?? '') ? current : [...current, map?.key ?? ''],
                        )
                      }
                      src={currentMapImage}
                    />
                  ) : (
                    <div
                      className={`respawn-map-atlas ${styles.atlas}`}
                      style={
                        {
                          '--map-accent': map?.color ?? '#3d7ea6',
                        } as CSSProperties
                      }
                    >
                      <div className={styles.atlasGrid} aria-hidden />
                      <div className={styles.atlasGlow} aria-hidden />
                      <div className={styles.atlasCopy}>
                        <span className={styles.atlasEyebrow}>Teren polowania</span>
                        <strong>{map?.key}</strong>
                        <span>
                          {map?.bosses.length ?? 0} bossów · {map?.metins.length ?? 0} metinów · CH
                          {channel}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="respawn-map-shade" />
                  <div className="respawn-map-caption">
                    <strong>{map?.key}</strong>
                    <span>
                      CH{channel} · {mapPins.length} pinezek
                    </span>
                  </div>
                  {mapPins.map((record) => {
                    const pin = record.location!;
                    const phase = getRespawnDisplay(record, now).phase;
                    return (
                      <button
                        className={`respawn-map-marker is-${record.kind} is-${phase}`}
                        key={record.key}
                        onClick={() => {
                          setNotice(
                            `${record.entity.name}: ostatnie zbicie${
                              record.confirmedBy ? ` · ${record.confirmedBy}` : ''
                            } · ${getRespawnDisplay(record, now).label}`,
                          );
                        }}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        type="button"
                      >
                        {record.entity.iconPath ? (
                          <img
                            alt=""
                            className="respawn-entity-icon"
                            src={record.entity.iconPath}
                          />
                        ) : (
                          <Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={15} />
                        )}
                        <span>{record.entity.name}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="respawn-map-help">
                  Pinezki = ostatnie zbicie z mini-okna po <b>Zbite</b>. Party skauta jest na /maps.
                </p>
              </div>
            )}
            <div className="respawn-records">
              {available.map((record) => renderRecord(record, false))}
              {counting.length > 0 ? (
                <div className="respawn-counting-block">
                  <header>
                    <span className="section-kicker">Po zbiciu</span>
                    <h3>Odliczanie — cel nie znika</h3>
                    <p>
                      Zbite cele zjeżdżają tu z zegarem do okna respawnu. Ponowne <b>Zbite</b>{' '}
                      dopiero gdy otworzy się okno.
                    </p>
                  </header>
                  {counting.map((record) => renderRecord(record, true))}
                </div>
              ) : null}
              {available.length === 0 && counting.length === 0 ? (
                <p className="respawn-empty">Brak timerów w tym filtrze.</p>
              ) : null}
            </div>
          </div>
          <aside className="panel respawn-timers-hint">
            <header>
              <span className="section-kicker">Cykl</span>
              <h2>Zbite → mini-mapa → timer ↓</h2>
              <p>
                W grze zbijaasz cel, tu klikasz <b>Zbite</b> — otwiera się mini-mapa do pinezki
                (możesz pominąć). Cel zjeżdża na dół z odliczaniem. Party i pinezki skauta są osobno
                na <a href="/maps">/maps</a>.
              </p>
            </header>
            {view !== 'map' ? (
              <button
                className="respawn-party-toggle is-on"
                onClick={() => setView('map')}
                type="button"
              >
                <span /> Otwórz pełny atlas
              </button>
            ) : (
              <p className="respawn-list-lead">
                Pinezki = ostatnia znana lokalizacja na mapie/kanale. Bez Party.
              </p>
            )}
          </aside>
        </section>
        <p aria-live="polite" className="respawn-notice">
          {notice}
        </p>
        <p className="respawn-data-note">
          Timery metinów/bossów ≠ Party ≠ Postęp PH na karcie postaci. Katalog: dump dobry-temat.
          Dane lokalnie w przeglądarce.
        </p>

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
                    className="respawn-map-marker is-metin is-selected"
                    style={{
                      left: `${modalDraftLocation.x}%`,
                      top: `${modalDraftLocation.y}%`,
                    }}
                  >
                    <Icon name="map" size={15} />
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
