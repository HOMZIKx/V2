'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  claimsForPartyScope,
  createMapParty,
  requestPartyJoin,
  resolvePartyRequest,
  setPartyChannel,
  setPartyMap,
  togglePartyVisibility,
  upsertSpawnClaim,
  type MapParty,
  type MapSpawnClaim,
  type PartyVisibility,
} from '../../src/map-party';
import {
  buildMapRespawnRecords,
  canConfirmRespawn,
  getRespawnDisplay,
  respawnMaps,
  type RespawnKind,
  type RespawnLocation,
  type RespawnRecord,
} from '../../src/respawn-timers';
import { AppShell, Icon } from '../app-shell';
import styles from './map-hunting.module.css';

type Filter = 'all' | RespawnKind | 'active';
type View = 'timers' | 'map';
type RecordStore = Record<string, readonly RespawnRecord[]>;
interface LocalPartyState { readonly party: MapParty | null; readonly claims: readonly MapSpawnClaim[]; }

const filters: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: 'all', label: 'Wszystkie' }, { id: 'boss', label: 'Bossy' },
  { id: 'metin', label: 'Metiny' }, { id: 'active', label: 'Okno / mapa' },
];
const mapFiles: Readonly<Record<string, string>> = {
  M1: 'map_m1.png', M2: 'map_m2.png', M3: 'map_m3.png', 'Dolina Orków': 'map_orki.png',
  'Pustynia Yongbi': 'map_pustynia.png', 'Świątynia Hwang': 'map_swiatynia.png',
  'Góra Sohan': 'map_sohan.png', 'Ognista Ziemia': 'map_ognista.png',
  'Las Duchów': 'map_lasduchow.png', 'Kraina Gigantów': 'map_giganty.png',
  'Czerwony Las': 'map_czerwonylas.png', 'Wężowe Pole': 'map_wezowe.png',
  'Atlantyda V1': 'map_atlantyda_v1_new.png', 'Atlantyda V2': 'map_atlantyda_v2_new.png',
};
const scopeKey = (mapKey: string, channel: number) => `${mapKey}:ch${channel}`;
const mapImage = (mapKey: string) => mapFiles[mapKey] ? `/game/maps/${mapFiles[mapKey]}` : null;
const formatWindow = (record: RespawnRecord) => record.entity.respawnTimeMin === record.entity.respawnTimeMax ? `${record.entity.respawnTimeMin} min` : `${record.entity.respawnTimeMin}–${record.entity.respawnTimeMax} min`;
function initialStore(): RecordStore {
  const first = respawnMaps[0];
  return first ? { [scopeKey(first.key, 1)]: buildMapRespawnRecords(first, 1) } : {};
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
  const [failedMapImages, setFailedMapImages] = useState<readonly string[]>([]);
  const [party, setParty] = useState<MapParty | null>(null);
  const [claims, setClaims] = useState<readonly MapSpawnClaim[]>([]);
  const [partyLoaded, setPartyLoaded] = useState(false);
  const [requestName, setRequestName] = useState('');
  const scope = scopeKey(map?.key ?? '', channel);
  const records = store[scope] ?? (map ? buildMapRespawnRecords(map, channel) : []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('destiled:map-hunting-state:v2');
      if (raw) setStore((current) => ({ ...current, ...(JSON.parse(raw) as RecordStore) }));
    } catch { /* keep the fixture */ }
  }, []);
  useEffect(() => { window.localStorage.setItem('destiled:map-hunting-state:v2', JSON.stringify(store)); }, [store]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('destiled:map-party:v1');
      if (raw) {
        const saved = JSON.parse(raw) as LocalPartyState;
        if ((saved.party === null || typeof saved.party === 'object') && Array.isArray(saved.claims)) {
          setParty(saved.party); setClaims(saved.claims);
        }
      }
    } catch { /* keep empty party */ } finally { setPartyLoaded(true); }
  }, []);
  useEffect(() => {
    if (partyLoaded) window.localStorage.setItem('destiled:map-party:v1', JSON.stringify({ party, claims } satisfies LocalPartyState));
  }, [claims, party, partyLoaded]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const phase = getRespawnDisplay(record, now).phase;
    return filter === 'all' || record.kind === filter || (filter === 'active' && (phase === 'window' || phase === 'on_map'));
  }), [filter, now, records]);
  const activeTimerCount = useMemo(() => records.filter((record) => ['countdown', 'window', 'on_map'].includes(getRespawnDisplay(record, now).phase)).length, [now, records]);
  const currentMapImage = mapImage(map?.key ?? '');
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(map?.key ?? '');
  // A marker belongs to the party scope, but it must disappear together with the
  // respawn cycle. Keeping the historical claim in storage lets the next update
  // replace it, without leaving a stale boss/metin marker on the map.
  const partyClaims = useMemo(() => claimsForPartyScope(claims, party, map?.key ?? '', channel).filter((claim) => {
    const record = records.find((item) => item.key === claim.timerKey);
    return Boolean(record && getRespawnDisplay(record, now).phase !== 'expired');
  }), [claims, channel, map?.key, now, party, records]);

  const updateCurrentScope = (updater: (current: readonly RespawnRecord[]) => readonly RespawnRecord[]) => {
    if (!map) return;
    setStore((current) => ({ ...current, [scope]: updater(current[scope] ?? buildMapRespawnRecords(map, channel)) }));
  };
  const changeMap = (nextMapKey: string) => {
    setMapKey(nextMapKey); setChannel(1); setPlacingKey(null);
    setParty((current) => current ? setPartyMap(current, nextMapKey) : null);
  };
  const changeChannel = (nextChannel: number) => {
    setChannel(nextChannel); setPlacingKey(null);
    setParty((current) => current ? setPartyChannel(current, nextChannel) : null);
  };
  const confirmKilled = (recordKey: string, location: RespawnLocation | null) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, Date.now())) {
      setNotice('Ten punkt ma aktywny timer. Kolejne zbicie odblokuje się po pełnym cyklu.'); return;
    }
    const confirmedAt = Date.now();
    updateCurrentScope((current) => current.map((record) => record.key === recordKey ? { ...record, confirmedAt, confirmedBy: initialSnapshot.viewerName, location } : record));
    if (location && party) setClaims((current) => upsertSpawnClaim(current, {
      id: `claim-${recordKey}-${confirmedAt}`, partyId: party.id, mapKey: target.mapKey, channel: target.channel,
      timerKey: recordKey, entityName: target.entity.name, kind: target.kind, location, claimedAt: confirmedAt, claimedBy: initialSnapshot.viewerName,
    }));
    setPlacingKey(null);
    setNotice(location ? 'Zbicie zapisane i oznaczone dla tego party.' : 'Zbicie zapisane bez znacznika party.');
  };
  const beginPlacement = (recordKey: string) => {
    const target = records.find((record) => record.key === recordKey);
    if (!target || !canConfirmRespawn(target, now)) return;
    if (!party) { setNotice('Najpierw utwórz lub dołącz do party. Timery działają niezależnie od party.'); return; }
    setView('map'); setPlacingKey(recordKey);
    setNotice('Kliknij punkt — znacznik zobaczy wyłącznie to party na bieżącym kanale.');
  };
  const placeOnMap = (event: MouseEvent<HTMLDivElement>) => {
    if (!placingKey) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    confirmKilled(placingKey, {
      x: Math.max(0, Math.min(100, Math.round(((event.clientX - bounds.left) / bounds.width) * 1_000) / 10)),
      y: Math.max(0, Math.min(100, Math.round(((event.clientY - bounds.top) / bounds.height) * 1_000) / 10)),
    });
  };
  const createParty = (visibility: PartyVisibility) => {
    const next = createMapParty({ leader: { id: 'mateusz', displayName: initialSnapshot.viewerName }, mapKey: map?.key ?? 'M1', activeChannel: channel, visibility, now: Date.now() });
    setParty(next); setClaims([]);
    setNotice(`${visibility === 'open' ? 'Otwarte' : 'Zamknięte'} party utworzone na ${next.mapKey}, CH${next.activeChannel}.`);
  };
  const addRequest = () => {
    const name = requestName.trim();
    if (!party || !name) return;
    setParty((current) => current ? requestPartyJoin(current, { id: `guest-${name.toLocaleLowerCase('pl').replace(/\s+/g, '-')}`, displayName: name }) : null);
    setRequestName(''); setNotice(`${name} czeka na decyzję lidera party.`);
  };

  return <AppShell activeSection="maps" viewerName={initialSnapshot.viewerName}>
    <main className="respawn-page" id="main-content">
      <header className="respawn-header">
        <div><span className="eyebrow">Wyprawa · niezależny moduł</span><h1>Metiny i bossy</h1><p>Timery są niezależne. Party służy wyłącznie do wspólnego latania i znaczników na mapie.</p></div>
        <div className="respawn-header-actions"><button className={view === 'timers' ? 'is-active' : ''} onClick={() => setView('timers')} type="button">Timery</button><button className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')} type="button">Mapa i znaczniki</button></div>
      </header>
      <section className="respawn-controls panel">
        <div className="respawn-map-select"><label htmlFor="respawn-map">Teren party</label><select id="respawn-map" onChange={(event) => changeMap(event.target.value)} value={map?.key ?? ''}>{respawnMaps.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.key}</option>)}</select></div>
        <div className="respawn-channel-select"><span>Aktywny kanał</span><div className="respawn-channels">{Array.from({ length: map?.channels ?? 0 }, (_, index) => index + 1).map((value) => <button aria-pressed={value === channel} className={value === channel ? 'is-active' : ''} key={value} onClick={() => changeChannel(value)} type="button">CH{value}</button>)}</div></div>
        <div className="respawn-controls-stat"><strong>{records.length}</strong><span>timerów na tej mapie</span></div><div className="respawn-controls-stat"><strong>{activeTimerCount}</strong><span>aktywnych timerów</span></div>
      </section>
      <section className="respawn-workspace">
        <div className="panel respawn-main-panel">
          <header className="respawn-list-header"><div><span className="section-kicker">{map?.key} · CH{channel}</span><h2>{view === 'map' ? 'Mapa wyprawy' : 'Lista timerów'}</h2></div><div className="respawn-filters">{filters.map((item) => <button aria-pressed={filter === item.id} className={filter === item.id ? 'is-active' : ''} key={item.id} onClick={() => setFilter(item.id)} type="button">{item.label}</button>)}</div></header>
          {view === 'map' && <div className="respawn-map-stage-wrap"><div aria-label={placingKey ? 'Kliknij pozycję znacznika' : 'Mapa z zaznaczeniami party'} className={`respawn-map-stage ${placingKey ? 'is-placing' : ''}`} onClick={placeOnMap} role={placingKey ? 'button' : undefined} tabIndex={placingKey ? 0 : undefined}>{canShowMapImage ? <img alt={`Mapa ${map?.key ?? ''}`} onError={() => setFailedMapImages((current) => current.includes(map?.key ?? '') ? current : [...current, map?.key ?? ''])} src={currentMapImage} /> : <div className={`respawn-map-fallback ${styles.fallback}`}><Icon name="map" size={27} /><strong>Brakuje lokalnej grafiki: {map?.key}</strong><span>Po skopiowaniu grafiki ze starej aplikacji pojawi się pełna mapa. Mechanika party i kanałów już działa.</span></div>}<div className="respawn-map-shade" /><div className="respawn-map-caption"><strong>{map?.key}</strong><span>CH{channel} · {party ? `${party.visibility === 'open' ? 'otwarte' : 'zamknięte'} party` : 'bez party'}</span></div>{placingKey && <div className="respawn-placement-callout"><Icon name="plus" size={16} /> Kliknij pozycję: {records.find((record) => record.key === placingKey)?.entity.name}</div>}{partyClaims.map((claim) => <button className={`respawn-map-marker is-${claim.kind}`} key={claim.id} onClick={(event) => { event.stopPropagation(); setNotice(`${claim.entityName}: oznaczył ${claim.claimedBy} dla tego party.`); }} style={{ left: `${claim.location.x}%`, top: `${claim.location.y}%` }} type="button"><Icon name={claim.kind === 'boss' ? 'activity' : 'map'} size={15} /><span>{claim.entityName}</span></button>)}</div><p className="respawn-map-help">{placingKey ? 'Kliknij na mapie, aby zatwierdzić zbicie i punkt dla party.' : party ? 'Wybierz „Zbite + mapa” przy timerze. Znacznik zobaczy wyłącznie Twoje party na bieżącym kanale.' : 'Timery możesz prowadzić bez party. Party utwórz dopiero, gdy chcecie wspólnie latać mapę.'}</p></div>}
          <div className="respawn-records">{visibleRecords.map((record) => { const display = getRespawnDisplay(record, now); const canConfirm = canConfirmRespawn(record, now); return <article className={`respawn-record is-${display.phase}`} key={record.key}><span className="respawn-record-icon" style={{ color: record.entity.color ?? undefined }}><Icon name={record.kind === 'boss' ? 'activity' : 'map'} size={17} /></span><div className="respawn-record-copy"><strong>{record.entity.name}</strong><span>{record.kind === 'boss' ? 'Boss' : 'Metin'} · respawn {formatWindow(record)} · {record.confirmedBy ? `zgłosił ${record.confirmedBy}` : 'brak zgłoszenia'}</span></div><div className="respawn-record-time"><b>{display.clock}</b><span>{display.label}</span></div><div className="respawn-record-actions"><button disabled={!canConfirm} onClick={() => confirmKilled(record.key, null)} type="button">{canConfirm ? 'Zbite' : 'Timer aktywny'}</button><button disabled={!canConfirm} onClick={() => beginPlacement(record.key)} type="button">Zbite + mapa</button></div></article>; })}{visibleRecords.length === 0 && <p className="respawn-empty">Brak timerów w tym filtrze.</p>}</div>
        </div>
        <aside className="panel respawn-party-panel">{!party ? <><header><span className="section-kicker">Party wyprawy</span><h2>Nie latasz jeszcze w party</h2><p>Wybierz otwarte party dla każdego albo zamknięte z kodem i decyzją lidera.</p></header><button className="respawn-party-toggle is-on" onClick={() => createParty('open')} type="button"><span /> Utwórz otwarte party</button><button className="respawn-party-toggle" onClick={() => createParty('closed')} type="button"><span /> Utwórz zamknięte party</button></> : <><header><span className="section-kicker">Party wyprawy</span><h2>{party.name}</h2><p>{party.visibility === 'open' ? 'Otwarte: każdy może wysłać prośbę o wejście.' : `Zamknięte: kod ${party.joinCode}, lider zatwierdza wejście.`}</p></header><button className={`respawn-party-toggle ${party.visibility === 'open' ? 'is-on' : ''}`} onClick={() => setParty((current) => current ? togglePartyVisibility(current) : null)} type="button"><span />{party.visibility === 'open' ? 'Party otwarte · zamknij' : 'Party zamknięte · otwórz'}</button><div className="respawn-party-members">{party.members.map((member) => <div key={member.id}><span className="respawn-member-dot is-online" /><strong>{member.displayName}</strong><small>{member.role === 'leader' ? 'lider' : 'uczestnik'}</small></div>)}</div><div className="respawn-party-feed"><span>Dołączenie do party</span><p>Kod: <b>{party.joinCode}</b> · {party.mapKey} · CH{party.activeChannel}</p><label className="catalog-search"><span className="sr-only">Nazwa osoby proszącej o wejście</span><input onChange={(event) => setRequestName(event.target.value)} placeholder="Nazwa osoby do party" value={requestName} /></label><button className="respawn-party-toggle" disabled={!requestName.trim()} onClick={addRequest} type="button"><span /> Dodaj prośbę</button>{party.requests.filter((request) => request.status === 'pending').map((request) => <p key={request.id}><b>{request.displayName}</b> prosi o wejście <button onClick={() => setParty((current) => current ? resolvePartyRequest(current, request.id, true) : null)} type="button">Przyjmij</button> <button onClick={() => setParty((current) => current ? resolvePartyRequest(current, request.id, false) : null)} type="button">Odrzuć</button></p>)}</div></>}</aside>
      </section>
      <p aria-live="polite" className="respawn-notice">{notice}</p><p className="respawn-data-note">Port modelu starej aplikacji: party ma lidera, otwarty/zamknięty dostęp, kod, prośby i znaczniki ograniczone do mapy oraz kanału. Ten podgląd zapisuje dane lokalnie; wspólna wersja wymaga API/Postgresa i bota Discord.</p>
    </main>
  </AppShell>;
}
