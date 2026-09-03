'use client';

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';

import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  buildMapRespawnRecords,
  canConfirmRespawn,
  getRespawnDisplay,
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
const mapFiles: Readonly<Record<string, string>> = {
  M1: 'map_m1.png',
  M2: 'map_m2.png',
  M3: 'map_m3.png',
  'Dolina Orków': 'map_orki.png',
  'Pustynia Yongbi': 'map_pustynia.png',
  'Świątynia Hwang': 'map_swiatynia.png',
  'Góra Sohan': 'map_sohan.png',
  'Ognista Ziemia': 'map_ognista.png',
  'Las Duchów': 'map_lasduchow.png',
  'Kraina Gigantów': 'map_giganty.png',
  'Czerwony Las': 'map_czerwonylas.png',
  'Wężowe Pole': 'map_wezowe.png',
  'Atlantyda V1': 'map_atlantyda_v1_new.png',
  'Atlantyda V2': 'map_atlantyda_v2_new.png',
  'Grota Wygnańców': 'map_grota_wygnancow.png',
  'Loch Małp Łatwy': 'map_loch_malp_latwy.png',
  'Loch Małp Średni': 'map_loch_malp_sredni.png',
  'Loch Małp Trudny': 'map_loch_malp_trudny.png',
  'Loch Pająków V2': 'map_loch_pajakow_v2.png',
};
const scopeKey = (mapKey: string, channel: number) => `${mapKey}:ch${channel}`;
const mapImage = (mapKey: string) => (mapFiles[mapKey] ? `/game/maps/${mapFiles[mapKey]}` : null);
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
  const [placingKey, setPlacingKey] = useState<string | null>(null);
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

  const visibleRecords = useMemo(
    () =>
      records.filter((record) => {
        const phase = getRespawnDisplay(record, now).phase;
        return (
          filter === 'all' ||
          record.kind === filter ||
          (filter === 'active' && (phase === 'window' || phase === 'on_map'))
        );
      }),
    [filter, now, records],
  );
  const activeTimerCount = useMemo(
    () =>
      records.filter((record) =>
        ['countdown', 'window', 'on_map'].includes(getRespawnDisplay(record, now).phase),
      ).length,
    [now, records],
  );
  const mapPins = useMemo(() => records.filter((record) => record.location !== null), [records]);
  const currentMapImage = mapImage(map?.key ?? '');
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(map?.key ?? '');

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
    setPlacingKey(null);
  };
  const changeChannel = (nextChannel: number) => {
    setChannel(nextChannel);
    setPlacingKey(null);
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
    setPlacingKey(null);
    setNotice(
      location
        ? 'Zbicie zapisane. Pinezka = ostatnia znana lokalizacja. Timer ruszył.'
        : 'Zbicie zapisane. Timer ruszył (bez nowej pinezki).',
    );
  };
  const beginPlacement = (recordKey: string) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, now)) return;
    setView('map');
    setPlacingKey(recordKey);
    setNotice('Kliknij mapę — pinezka pokaże, gdzie ostatnio zbito ten metin/bossa.');
  };
  const placeOnMap = (event: MouseEvent<HTMLDivElement>) => {
    if (!placingKey) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    confirmKilled(placingKey, {
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

  return (
    <AppShell activeSection="timers" viewerName={initialSnapshot.viewerName}>
      <main className="respawn-page" id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Timery</h1>
            <p>
              Osobny system od party i EQ: mapa + czasy respawnu z katalogu. Zbijasz w grze →
              zaznaczasz zbicie → opcjonalnie pinezka na atlasie → timer rusza. Ponowne zbicie
              dopiero gdy otworzy się okno (np. 20–30 min = 10 min okna).
            </p>
          </div>
          <div className="respawn-header-actions" role="tablist" aria-label="Widok wyprawy">
            <button
              aria-selected={view === 'timers'}
              className={view === 'timers' ? 'is-active' : ''}
              onClick={() => {
                setView('timers');
                setPlacingKey(null);
              }}
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
                  className={value === channel ? 'is-active' : ''}
                  key={value}
                  onClick={() => changeChannel(value)}
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
                    {map?.bosses.length ?? 0} bossów · {map?.metins.length ?? 0} metinów ·{' '}
                    {records.length} timerów na kanale
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
                <div
                  aria-label={
                    placingKey ? 'Kliknij pozycję pinezki' : 'Mapa z ostatnimi lokalizacjami'
                  }
                  className={`respawn-map-stage ${placingKey ? 'is-placing' : ''}`}
                  onClick={placeOnMap}
                  role={placingKey ? 'button' : undefined}
                  tabIndex={placingKey ? 0 : undefined}
                >
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
                  {placingKey && (
                    <div className="respawn-placement-callout">
                      <Icon name="plus" size={16} /> Kliknij pozycję:{' '}
                      {records.find((record) => record.key === placingKey)?.entity.name}
                    </div>
                  )}
                  {mapPins.map((record) => {
                    const pin = record.location!;
                    const phase = getRespawnDisplay(record, now).phase;
                    return (
                      <button
                        className={`respawn-map-marker is-${record.kind} is-${phase}`}
                        key={record.key}
                        onClick={(event) => {
                          event.stopPropagation();
                          setNotice(
                            `${record.entity.name}: ostatnie zbicie${
                              record.confirmedBy ? ` · ${record.confirmedBy}` : ''
                            } · ${getRespawnDisplay(record, now).label}`,
                          );
                        }}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        type="button"
                      >
                        <Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={15} />
                        <span>{record.entity.name}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="respawn-map-help">
                  {placingKey
                    ? 'Kliknij na mapie: zbicie + pinezka ostatniej znanej lokalizacji.'
                    : '„Zbite + mapa” ustawia pinezkę. Nie wymaga party — Timery to osobny system.'}
                </p>
              </div>
            )}
            <div className="respawn-records">
              {visibleRecords.map((record) => {
                const display = getRespawnDisplay(record, now);
                const canConfirm = canConfirmRespawn(record, now);
                return (
                  <article className={`respawn-record is-${display.phase}`} key={record.key}>
                    <span
                      className="respawn-record-icon"
                      style={{ color: record.entity.color ?? undefined }}
                    >
                      <Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={17} />
                    </span>
                    <div className="respawn-record-copy">
                      <strong>{record.entity.name}</strong>
                      <span>
                        {record.kind === 'boss' ? 'Boss' : 'Metin'} · respawn {formatWindow(record)}{' '}
                        ·{' '}
                        {record.location
                          ? `pinezka ${Math.round(record.location.x)}/${Math.round(record.location.y)}`
                          : 'bez pinezki'}
                        {record.confirmedBy ? ` · zgłosił ${record.confirmedBy}` : ''}
                      </span>
                    </div>
                    <div className="respawn-record-time">
                      <b>{display.clock}</b>
                      <span>{display.label}</span>
                    </div>
                    <div className="respawn-record-actions">
                      <button
                        disabled={!canConfirm}
                        onClick={() => confirmKilled(record.key, null)}
                        type="button"
                      >
                        {canConfirm ? 'Zbite' : 'Odliczanie'}
                      </button>
                      <button
                        disabled={!canConfirm}
                        onClick={() => beginPlacement(record.key)}
                        type="button"
                      >
                        Zbite + mapa
                      </button>
                    </div>
                  </article>
                );
              })}
              {visibleRecords.length === 0 && (
                <p className="respawn-empty">Brak timerów w tym filtrze.</p>
              )}
            </div>
          </div>
          <aside className="panel respawn-timers-hint">
            <header>
              <span className="section-kicker">Cykl</span>
              <h2>Zbite → timer → okno → znowu</h2>
              <p>
                W grze znajdujesz metina/bossa, zbijaasz, tu klikasz <b>Zbite</b> (lub{' '}
                <b>Zbite + mapa</b> i pinezka). Jedziesz dalej. Dopóki trwa odliczanie, nie
                klikniesz drugi raz. Gdy otworzy się okno respawnu — możesz oznaczyć kolejne zbicie.
              </p>
            </header>
            {view !== 'map' ? (
              <button
                className="respawn-party-toggle is-on"
                onClick={() => setView('map')}
                type="button"
              >
                <span /> Otwórz atlas mapy
              </button>
            ) : (
              <p className="respawn-list-lead">
                Pinezki = ostatnia znana lokalizacja na mapie/kanale. Bez party.
              </p>
            )}
          </aside>
        </section>
        <p aria-live="polite" className="respawn-notice">
          {notice}
        </p>
        <p className="respawn-data-note">
          Timery metinów/bossów ≠ party, ≠ Postęp PH na karcie postaci. Katalog: dump dobry-temat.
          Dane lokalnie w przeglądarce.
        </p>
      </main>
    </AppShell>
  );
}
