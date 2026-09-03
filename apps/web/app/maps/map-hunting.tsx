'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  buildMapRespawnRecords,
  canConfirmRespawn,
  getRespawnDisplay,
  respawnMaps,
  type RespawnKind,
  type RespawnLocation,
  type RespawnRecord,
} from '../../src/respawn-timers';
import type { MapHuntingSnapshot } from '../../src/map-hunting';
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

const partyMembers = [
  { name: 'Mateusz', state: 'online' },
  { name: 'XiaoHu', state: 'online' },
  { name: 'Wicek', state: 'zaraz wraca' },
  { name: 'Aalpsik', state: 'offline' },
] as const;

const mapFiles: Readonly<Record<string, string>> = {
  M1: 'map_m1.png', M2: 'map_m2.png', M3: 'map_m3.png',
  'Dolina Orków': 'map_orki.png', 'Pustynia Yongbi': 'map_pustynia.png', 'Świątynia Hwang': 'map_swiatynia.png',
  'Góra Sohan': 'map_sohan.png', 'Ognista Ziemia': 'map_ognista.png', 'Las Duchów': 'map_lasduchow.png',
  'Kraina Gigantów': 'map_giganty.png', 'Czerwony Las': 'map_czerwonylas.png', 'Wężowe Pole': 'map_wezowe.png',
  'Atlantyda V1': 'map_atlantyda_v1_new.png', 'Atlantyda V2': 'map_atlantyda_v2_new.png',
};

function mapImage(mapKey: string): string | null {
  const file = mapFiles[mapKey];
  return file ? `https://raw.githubusercontent.com/HOMZIKx/dobry-temat/main/frontend/public/${file}` : null;
}

function scopeKey(mapKey: string, channel: number): string { return `${mapKey}:ch${channel}`; }
function formatWindow(record: RespawnRecord): string { return record.entity.respawnTimeMin === record.entity.respawnTimeMax ? `${record.entity.respawnTimeMin} min` : `${record.entity.respawnTimeMin}–${record.entity.respawnTimeMax} min`; }
function initialStore(): RecordStore { const firstMap = respawnMaps[0]; return firstMap ? { [scopeKey(firstMap.key, 1)]: buildMapRespawnRecords(firstMap, 1) } : {}; }

function savedStore(): RecordStore | null {
  try { const raw = window.localStorage.getItem('destiled:map-hunting-state:v2'); return raw ? JSON.parse(raw) as RecordStore : null; } catch { return null; }
}

export function MapHunting({ initialSnapshot }: { readonly initialSnapshot: MapHuntingSnapshot }) {
  const [mapKey, setMapKey] = useState(respawnMaps[0]?.key ?? '');
  const map = respawnMaps.find((candidate) => candidate.key === mapKey) ?? respawnMaps[0];
  const [channel, setChannel] = useState(1);
  const [view, setView] = useState<View>('timers');
  const [filter, setFilter] = useState<Filter>('all');
  const [store, setStore] = useState<RecordStore>(initialStore);
  const [now, setNow] = useState(() => Date.now());
  const [placingKey, setPlacingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [partyOpen, setPartyOpen] = useState(true);
  const [failedMapImages, setFailedMapImages] = useState<readonly string[]>([]);
  const scope = scopeKey(map?.key ?? '', channel);
  const records = store[scope] ?? (map ? buildMapRespawnRecords(map, channel) : []);

  useEffect(() => { const saved = savedStore(); if (saved) setStore((current) => ({ ...current, ...saved })); }, []);
  useEffect(() => { window.localStorage.setItem('destiled:map-hunting-state:v2', JSON.stringify(store)); }, [store]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const phase = getRespawnDisplay(record, now).phase;
    return filter === 'all' || record.kind === filter || (filter === 'active' && (phase === 'window' || phase === 'on_map'));
  }), [filter, now, records]);
  const activeRecords = useMemo(() => records.filter((record) => {
    const phase = getRespawnDisplay(record, now).phase;
    return record.location !== null && (phase === 'window' || phase === 'on_map' || phase === 'countdown');
  }), [now, records]);
  const currentMapImage = mapImage(map?.key ?? '');
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(map?.key ?? '');

  const updateCurrentScope = (updater: (current: readonly RespawnRecord[]) => readonly RespawnRecord[]) => {
    if (!map) return;
    setStore((current) => ({ ...current, [scope]: updater(current[scope] ?? buildMapRespawnRecords(map, channel)) }));
  };
  const changeMap = (nextMapKey: string) => { setMapKey(nextMapKey); setChannel(1); setPlacingKey(null); };
  const confirmKilled = (recordKey: string, location: RespawnLocation | null) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, Date.now())) { setNotice('Ten timer jest już aktywny. Kolejne zbicie odblokuje się dopiero po zakończeniu pełnego cyklu.'); return; }
    updateCurrentScope((current) => current.map((record) => record.key === recordKey ? { ...record, confirmedAt: Date.now(), confirmedBy: initialSnapshot.viewerName, location } : record));
    setPlacingKey(null);
    setNotice(location ? 'Zbicie zapisane i oznaczone na mapie party.' : 'Zbicie zapisane bez punktu na mapie.');
  };
  const beginPlacement = (recordKey: string) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, now)) return;
    setView('map'); setPlacingKey(recordKey); setNotice('Kliknij właściwe miejsce na mapie, aby zapisać wspólny znacznik.');
  };
  const placeOnMap = (event: MouseEvent<HTMLDivElement>) => {
    if (!placingKey) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - bounds.left) / bounds.width) * 1_000) / 10;
    const y = Math.round(((event.clientY - bounds.top) / bounds.height) * 1_000) / 10;
    confirmKilled(placingKey, { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  return (
    <AppShell activeSection="maps" viewerName={initialSnapshot.viewerName}>
      <main className="respawn-page" id="main-content">
        <header className="respawn-header">
          <div><span className="eyebrow">Wyprawa · niezależny moduł</span><h1>Metiny i bossy</h1><p>Wspólne timery, kanały, mapa i party. To nie jest część EQ ani timerów postaci.</p></div>
          <div className="respawn-header-actions"><button className={view === 'timers' ? 'is-active' : ''} onClick={() => setView('timers')} type="button">Timery</button><button className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')} type="button">Mapa i znaczniki</button></div>
        </header>

        <section className="respawn-controls panel">
          <div className="respawn-map-select"><label htmlFor="respawn-map">Teren</label><select id="respawn-map" onChange={(event) => changeMap(event.target.value)} value={map?.key ?? ''}>{respawnMaps.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.key}</option>)}</select></div>
          <div className="respawn-channel-select"><span>Kanał</span><div className="respawn-channels">{Array.from({ length: map?.channels ?? 0 }, (_, index) => index + 1).map((value) => <button aria-pressed={value === channel} className={value === channel ? 'is-active' : ''} key={value} onClick={() => { setChannel(value); setPlacingKey(null); }} type="button">CH{value}</button>)}</div></div>
          <div className="respawn-controls-stat"><strong>{records.length}</strong><span>timerów na tej mapie</span></div><div className="respawn-controls-stat"><strong>{activeRecords.length}</strong><span>aktywnych znaczników</span></div>
        </section>

        <section className="respawn-workspace">
          <div className="panel respawn-main-panel">
            <header className="respawn-list-header"><div><span className="section-kicker">{map?.key} · CH{channel}</span><h2>{view === 'map' ? 'Mapa wyprawy' : 'Lista timerów'}</h2></div><div className="respawn-filters">{filters.map((item) => <button aria-pressed={filter === item.id} className={filter === item.id ? 'is-active' : ''} key={item.id} onClick={() => setFilter(item.id)} type="button">{item.label}</button>)}</div></header>
            {view === 'map' && <div className="respawn-map-stage-wrap"><div aria-label={placingKey ? 'Kliknij pozycję znacznika' : 'Mapa z zaznaczeniami party'} className={`respawn-map-stage ${placingKey ? 'is-placing' : ''}`} onClick={placeOnMap} role={placingKey ? 'button' : undefined} tabIndex={placingKey ? 0 : undefined}>{canShowMapImage ? <img alt={`Mapa ${map?.key ?? ''}`} onError={() => setFailedMapImages((current) => current.includes(map?.key ?? '') ? current : [...current, map?.key ?? ''])} src={currentMapImage} /> : <div className={`respawn-map-fallback ${styles.fallback}`}><Icon name="map" size={27} /><strong>Brakuje lokalnej grafiki: {map?.key}</strong><span>Timer, kanał i zaznaczanie punktu działają. Grafikę trzeba skopiować do DESTILED — prywatne repo starej aplikacji nie może być źródłem obrazów produkcyjnych.</span></div>}<div className="respawn-map-shade" /><div className="respawn-map-caption"><strong>{map?.key}</strong><span>CH{channel} · party {partyOpen ? 'aktywne' : 'wyłączone'}</span></div>{placingKey && <div className="respawn-placement-callout"><Icon name="plus" size={16} /> Kliknij pozycję: {records.find((record) => record.key === placingKey)?.entity.name}</div>}{activeRecords.map((record) => { const display = getRespawnDisplay(record, now); return <button className={`respawn-map-marker is-${record.kind} is-${display.phase}`} key={record.key} onClick={(event) => { event.stopPropagation(); setNotice(`${record.entity.name}: ${display.label} · zgłosił ${record.confirmedBy ?? '—'}`); }} style={{ left: `${record.location!.x}%`, top: `${record.location!.y}%` }} type="button"><Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={15} /><span>{record.entity.name}</span></button>; })}</div><p className="respawn-map-help">{placingKey ? 'Kliknij na mapie, aby zatwierdzić zbicie i punkt dla party.' : 'Wybierz „Zbite + mapa” przy timerze, aby dodać znacznik. Znacznik pozostaje na mapie przez 5 minut po końcu okna.'}</p></div>}
            <div className="respawn-records">{visibleRecords.map((record) => { const display = getRespawnDisplay(record, now); const canConfirm = canConfirmRespawn(record, now); return <article className={`respawn-record is-${display.phase}`} key={record.key}><span className="respawn-record-icon" style={{ color: record.entity.color ?? undefined }}><Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={17} /></span><div className="respawn-record-copy"><strong>{record.entity.name}</strong><span>{record.kind === 'boss' ? 'Boss' : 'Metin'} · respawn {formatWindow(record)} · {record.confirmedBy ? `zgłosił ${record.confirmedBy}` : 'brak zgłoszenia'}</span></div><div className="respawn-record-time"><b>{display.clock}</b><span>{display.label}</span></div><div className="respawn-record-actions"><button disabled={!canConfirm} onClick={() => confirmKilled(record.key, null)} type="button">{canConfirm ? 'Zbite' : 'Timer aktywny'}</button><button disabled={!canConfirm} onClick={() => beginPlacement(record.key)} type="button">Zbite + mapa</button></div></article>; })}{visibleRecords.length === 0 && <p className="respawn-empty">Brak timerów w tym filtrze.</p>}</div>
          </div>
          <aside className="panel respawn-party-panel"><header><span className="section-kicker">Party wyprawy</span><h2>{partyOpen ? 'Asteria · wspólna mapa' : 'Party nieaktywne'}</h2><p>Znaczniki i zgłoszenia z tego kanału są widoczne dla uczestników party.</p></header><button className={`respawn-party-toggle ${partyOpen ? 'is-on' : ''}`} onClick={() => setPartyOpen((current) => !current)} type="button"><span />{partyOpen ? 'Party aktywne' : 'Uruchom party'}</button><div className="respawn-party-members">{partyMembers.map((member) => <div key={member.name}><span className={`respawn-member-dot is-${member.state === 'online' ? 'online' : member.state === 'offline' ? 'offline' : 'away'}`} /><strong>{member.name}</strong><small>{member.state}</small></div>)}</div><div className="respawn-party-feed"><span>Wspólne oznaczenia</span>{activeRecords.length ? activeRecords.slice(0, 5).map((record) => <p key={record.key}><b>{record.entity.name}</b> · {record.confirmedBy ?? '—'} · {getRespawnDisplay(record, now).clock}</p>) : <p>Jeszcze brak znaczników na tym kanale.</p>}</div></aside>
        </section>
        <p aria-live="polite" className="respawn-notice">{notice}</p><p className="respawn-data-note">Dane timerów i grafiki pochodzą z „dobry temat”. Ten ekran zapisuje testowe zgłoszenia lokalnie; następny krok to zapis do API/Postgres oraz event Discord, aby party działało między urządzeniami.</p>
      </main>
    </AppShell>
  );
}
