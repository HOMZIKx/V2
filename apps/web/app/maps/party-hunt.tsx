'use client';

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';

import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  PARTY_SCOUT_PIN_TTL_MS,
  activeScoutPins,
  createMapParty,
  dismissScoutPin,
  incrementSessionKills,
  placeScoutPin,
  requestPartyJoin,
  resolvePartyRequest,
  scoutPinAgeMinutes,
  scoutPinRemainingMs,
  setPartyChannel,
  setPartyMap,
  togglePartyVisibility,
  type MapParty,
  type PartyScoutPin,
  type PartyVisibility,
} from '../../src/map-party';
import { respawnMaps, type RespawnLocation } from '../../src/respawn-timers';
import { AppShell, Icon } from '../app-shell';
import styles from './map-hunting.module.css';

interface LocalPartyState {
  readonly party: MapParty | null;
  readonly pins: readonly PartyScoutPin[];
}

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

const mapImage = (mapKey: string) => (mapFiles[mapKey] ? `/game/maps/${mapFiles[mapKey]}` : null);
const STORAGE_KEY = 'destiled:map-party:v2';

function formatAge(minutes: number): string {
  if (minutes <= 0) return 'przed chwilą';
  if (minutes === 1) return '1 min temu';
  return `${minutes} min temu`;
}

export function PartyHunt({ initialSnapshot }: { readonly initialSnapshot: MapHuntingSnapshot }) {
  const [mapKey, setMapKey] = useState(respawnMaps[0]?.key ?? 'M1');
  const map = respawnMaps.find((candidate) => candidate.key === mapKey) ?? respawnMaps[0];
  const [channel, setChannel] = useState(1);
  const [party, setParty] = useState<MapParty | null>(null);
  const [pins, setPins] = useState<readonly PartyScoutPin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [pinLabel, setPinLabel] = useState('Metin');
  const [requestName, setRequestName] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failedMapImages, setFailedMapImages] = useState<readonly string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as LocalPartyState;
        if (saved.party === null || typeof saved.party === 'object') {
          const migrated = saved.party
            ? {
                ...saved.party,
                sessionKills:
                  typeof saved.party.sessionKills === 'number' ? saved.party.sessionKills : 0,
              }
            : null;
          setParty(migrated);
        }
        if (Array.isArray(saved.pins)) setPins(saved.pins);
      }
    } catch {
      /* empty party */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ party, pins } satisfies LocalPartyState),
    );
  }, [loaded, party, pins]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const visiblePins = useMemo(
    () => activeScoutPins(pins, party, mapKey, channel, now),
    [channel, mapKey, now, party, pins],
  );
  const currentMapImage = mapImage(mapKey);
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(mapKey);
  const selectedPin = visiblePins.find((pin) => pin.id === selectedPinId) ?? null;

  const changeMap = (next: string) => {
    setMapKey(next);
    setChannel(1);
    setPlacing(false);
    setSelectedPinId(null);
    setParty((current) => (current ? setPartyMap(current, next, 1) : null));
  };
  const changeChannel = (next: number) => {
    setChannel(next);
    setPlacing(false);
    setSelectedPinId(null);
    setParty((current) => (current ? setPartyChannel(current, next) : null));
  };
  const createParty = (visibility: PartyVisibility) => {
    const next = createMapParty({
      leader: { id: 'mateusz', displayName: initialSnapshot.viewerName },
      mapKey,
      activeChannel: channel,
      visibility,
      now: Date.now(),
    });
    setParty(next);
    setPins([]);
    setNotice(
      `${visibility === 'open' ? 'Otwarte' : 'Zamknięte'} party · ${next.mapKey} · kod ${next.joinCode}`,
    );
  };
  const addRequest = () => {
    const name = requestName.trim();
    if (!party || !name) return;
    setParty((current) =>
      current
        ? requestPartyJoin(current, {
            id: `guest-${name.toLocaleLowerCase('pl').replace(/\s+/g, '-')}`,
            displayName: name,
          })
        : null,
    );
    setRequestName('');
    setNotice(`${name} czeka na decyzję lidera.`);
  };
  const placeOnMap = (event: MouseEvent<HTMLDivElement>) => {
    if (!placing || !party) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const location: RespawnLocation = {
      x: Math.max(
        0,
        Math.min(100, Math.round(((event.clientX - bounds.left) / bounds.width) * 1_000) / 10),
      ),
      y: Math.max(
        0,
        Math.min(100, Math.round(((event.clientY - bounds.top) / bounds.height) * 1_000) / 10),
      ),
    };
    const pin: PartyScoutPin = {
      id: `pin-${Date.now()}`,
      partyId: party.id,
      mapKey,
      channel,
      location,
      placedAt: Date.now(),
      placedBy: initialSnapshot.viewerName,
      label: pinLabel.trim() || 'Metin',
      kind: 'metin',
    };
    setPins((current) => placeScoutPin(current, pin));
    setPlacing(false);
    setSelectedPinId(pin.id);
    setNotice(`Pinezka „${pin.label}” · znika po 10 min · widoczna dla party.`);
  };
  const dismissPin = (pinId: string) => {
    setPins((current) => dismissScoutPin(current, pinId));
    setSelectedPinId(null);
    setNotice('Pinezka odkliknięta.');
  };
  const killAndDismiss = (pinId: string) => {
    setParty((current) => (current ? incrementSessionKills(current) : null));
    setPins((current) => dismissScoutPin(current, pinId));
    setSelectedPinId(null);
    setNotice('Zbicie w sesji (+1). Pinezka zdjęta.');
  };
  const markSessionKill = () => {
    setParty((current) => (current ? incrementSessionKills(current) : null));
    setNotice('Zbicie w sesji (+1).');
  };

  return (
    <AppShell activeSection="maps" viewerName={initialSnapshot.viewerName}>
      <main className="respawn-page" id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Party</h1>
            <p>
              Osobna funkcja od Timerów. Tworzysz drużynę, zapraszasz / akceptujesz. Szukający
              stawia pinezkę (~10 min) — bijący jedzie i odklika. Sesja liczy zbicia.
            </p>
          </div>
          <div className="respawn-header-actions">
            <a className="respawn-party-toggle" href="/timers">
              <span /> Timery metinów (osobny system)
            </a>
          </div>
        </header>

        <section className="respawn-controls panel">
          <div className="respawn-map-select">
            <label htmlFor="party-map">Mapa (Twój widok)</label>
            <select
              id="party-map"
              onChange={(event) => changeMap(event.target.value)}
              value={mapKey}
            >
              {respawnMaps.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.key}
                </option>
              ))}
            </select>
          </div>
          <div className="respawn-channel-select">
            <span>Kanał</span>
            <div className="respawn-channels">
              {Array.from({ length: map?.channels ?? 8 }, (_, index) => index + 1).map((value) => (
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
            <strong>{party?.sessionKills ?? 0}</strong>
            <span>zbić w sesji</span>
          </div>
          <div className="respawn-controls-stat">
            <strong>{visiblePins.length}</strong>
            <span>aktywnych pinezek</span>
          </div>
        </section>

        <section className="respawn-workspace">
          <div className="panel respawn-main-panel">
            <header className="respawn-list-header">
              <div>
                <span className="section-kicker">
                  {mapKey} · CH{channel}
                </span>
                <h2>Wspólna mapa party</h2>
                <p className="respawn-list-lead">
                  Razem albo osobno wybieracie mapę. Pinezka = „tu jest metin”, nie timer respawnu.
                </p>
              </div>
              {party ? (
                <div className="respawn-filters">
                  <label className="catalog-search">
                    <span className="sr-only">Etykieta pinezki</span>
                    <input
                      onChange={(event) => setPinLabel(event.target.value)}
                      placeholder="Etykieta pinezki"
                      value={pinLabel}
                    />
                  </label>
                  <button
                    aria-pressed={placing}
                    className={placing ? 'is-active' : ''}
                    onClick={() => {
                      setPlacing((current) => !current);
                      setSelectedPinId(null);
                      setNotice(
                        placing
                          ? ''
                          : 'Kliknij mapę — pinezka będzie widoczna dla party przez ~10 min.',
                      );
                    }}
                    type="button"
                  >
                    {placing ? 'Anuluj pinezkę' : 'Postaw pinezkę'}
                  </button>
                  <button onClick={markSessionKill} type="button">
                    Zbite w sesji (+1)
                  </button>
                </div>
              ) : null}
            </header>

            <div className="respawn-map-stage-wrap">
              <div
                aria-label={placing ? 'Kliknij pozycję pinezki skauta' : 'Mapa party'}
                className={`respawn-map-stage ${placing ? 'is-placing' : ''}`}
                onClick={placeOnMap}
                role={placing ? 'button' : undefined}
                tabIndex={placing ? 0 : undefined}
              >
                {canShowMapImage ? (
                  <img
                    alt={`Mapa ${mapKey}`}
                    onError={() =>
                      setFailedMapImages((current) =>
                        current.includes(mapKey) ? current : [...current, mapKey],
                      )
                    }
                    src={currentMapImage}
                  />
                ) : (
                  <div
                    className={`respawn-map-atlas ${styles.atlas}`}
                    style={{ '--map-accent': map?.color ?? '#3d7ea6' } as CSSProperties}
                  >
                    <div className={styles.atlasGrid} aria-hidden />
                    <div className={styles.atlasGlow} aria-hidden />
                    <div className={styles.atlasCopy}>
                      <span className={styles.atlasEyebrow}>Party</span>
                      <strong>{mapKey}</strong>
                      <span>CH{channel}</span>
                    </div>
                  </div>
                )}
                <div className="respawn-map-shade" />
                <div className="respawn-map-caption">
                  <strong>{mapKey}</strong>
                  <span>
                    CH{channel} · TTL pinezki {Math.round(PARTY_SCOUT_PIN_TTL_MS / 60_000)} min
                  </span>
                </div>
                {placing ? (
                  <div className="respawn-placement-callout">
                    <Icon name="plus" size={16} /> Kliknij pozycję skauta: {pinLabel || 'Metin'}
                  </div>
                ) : null}
                {visiblePins.map((pin) => {
                  const age = scoutPinAgeMinutes(pin, now);
                  const remaining = Math.ceil(scoutPinRemainingMs(pin, now) / 60_000);
                  return (
                    <button
                      className={`respawn-map-marker is-metin${
                        selectedPinId === pin.id ? ' is-selected' : ''
                      }`}
                      key={pin.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPinId(pin.id);
                        setNotice(`${pin.label}: ${formatAge(age)} · znika za ~${remaining} min`);
                      }}
                      style={{ left: `${pin.location.x}%`, top: `${pin.location.y}%` }}
                      title={`${pin.label} · ${formatAge(age)} · ${pin.placedBy}`}
                      type="button"
                    >
                      <Icon name="map" size={15} />
                      <span>
                        {pin.label}
                        <em> · {formatAge(age)}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="respawn-map-help">
                {!party
                  ? 'Najpierw utwórz party obok — potem wspólna mapa i pinezki skauta.'
                  : placing
                    ? 'Kliknij atlas: pinezka „tu jest metin” (ok. 10 min).'
                    : 'Najechanie / klik pinezki pokazuje wiek. Bijący odklika dobrowolnie albo oznacza zbicie w sesji.'}
              </p>
              {selectedPin ? (
                <div className="respawn-party-feed">
                  <span>Pinezka</span>
                  <p>
                    <b>{selectedPin.label}</b> · {formatAge(scoutPinAgeMinutes(selectedPin, now))} ·{' '}
                    {selectedPin.placedBy}
                  </p>
                  <button onClick={() => dismissPin(selectedPin.id)} type="button">
                    Odkliknij pinezkę
                  </button>{' '}
                  <button onClick={() => killAndDismiss(selectedPin.id)} type="button">
                    Zbite w sesji (+1) i zdejmij
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="panel respawn-party-panel">
            {!party ? (
              <>
                <header>
                  <span className="section-kicker">Drużyna</span>
                  <h2>Utwórz party</h2>
                  <p>Wybierz mapę, stwórz drużynę, zaproś lub przyjmuj prośby. Bez Timerów.</p>
                </header>
                <button
                  className="respawn-party-toggle is-on"
                  onClick={() => createParty('open')}
                  type="button"
                >
                  <span /> Otwarte party
                </button>
                <button
                  className="respawn-party-toggle"
                  onClick={() => createParty('closed')}
                  type="button"
                >
                  <span /> Zamknięte party (kod)
                </button>
              </>
            ) : (
              <>
                <header>
                  <span className="section-kicker">Drużyna</span>
                  <h2>{party.name}</h2>
                  <p>
                    Kod <b>{party.joinCode}</b> ·{' '}
                    {party.visibility === 'open' ? 'otwarte' : 'zamknięte'} · zbicia sesji:{' '}
                    <b>{party.sessionKills}</b>
                  </p>
                </header>
                <button
                  className={`respawn-party-toggle ${party.visibility === 'open' ? 'is-on' : ''}`}
                  onClick={() =>
                    setParty((current) => (current ? togglePartyVisibility(current) : null))
                  }
                  type="button"
                >
                  <span />
                  {party.visibility === 'open'
                    ? 'Party otwarte · zamknij'
                    : 'Party zamknięte · otwórz'}
                </button>
                <div className="respawn-party-members">
                  {party.members.map((member) => (
                    <div key={member.id}>
                      <span className="respawn-member-dot is-online" />
                      <strong>{member.displayName}</strong>
                      <small>{member.role === 'leader' ? 'lider' : 'uczestnik'}</small>
                    </div>
                  ))}
                </div>
                <div className="respawn-party-feed">
                  <span>Zaproszenie / dostęp</span>
                  <label className="catalog-search">
                    <span className="sr-only">Nazwa osoby</span>
                    <input
                      onChange={(event) => setRequestName(event.target.value)}
                      placeholder="Nazwa osoby do party"
                      value={requestName}
                    />
                  </label>
                  <button
                    className="respawn-party-toggle"
                    disabled={!requestName.trim()}
                    onClick={addRequest}
                    type="button"
                  >
                    <span /> Dodaj prośbę
                  </button>
                  {party.requests
                    .filter((request) => request.status === 'pending')
                    .map((request) => (
                      <p key={request.id}>
                        <b>{request.displayName}</b> prosi{' '}
                        <button
                          onClick={() =>
                            setParty((current) =>
                              current ? resolvePartyRequest(current, request.id, true) : null,
                            )
                          }
                          type="button"
                        >
                          Przyjmij
                        </button>{' '}
                        <button
                          onClick={() =>
                            setParty((current) =>
                              current ? resolvePartyRequest(current, request.id, false) : null,
                            )
                          }
                          type="button"
                        >
                          Odrzuć
                        </button>
                      </p>
                    ))}
                </div>
                <button
                  className="respawn-party-toggle"
                  onClick={() => {
                    setParty(null);
                    setPins([]);
                    setNotice('Party zakończone (lokalny mock).');
                  }}
                  type="button"
                >
                  <span /> Zakończ party
                </button>
              </>
            )}
          </aside>
        </section>

        <p aria-live="polite" className="respawn-notice">
          {notice}
        </p>
        <p className="respawn-data-note">
          Party ≠ Timery respawnu ≠ Postęp PH. Pinezki skauta znikają po ~10 min. Dane lokalnie;
          wspólny realtime wymaga API.
        </p>
      </main>
    </AppShell>
  );
}
