'use client';

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';

import { huntMapImagePath } from '../../src/hunt-map-assets';
import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  PARTY_SCOUT_PIN_TTL_MS,
  activeScoutPins,
  createMapParty,
  dismissScoutPin,
  incrementSessionKills,
  placeScoutPin,
  pruneExpiredScoutPins,
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
          if (migrated) {
            setMapKey(migrated.mapKey);
            setChannel(migrated.activeChannel);
          }
        }
        if (Array.isArray(saved.pins)) {
          setPins(pruneExpiredScoutPins(saved.pins, Date.now()));
        }
      }
    } catch {
      /* empty party */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setPins((current) => {
      const pruned = pruneExpiredScoutPins(current, Date.now());
      return pruned.length === current.length ? current : pruned;
    });
  }, [loaded, now]);

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
  const currentMapImage = huntMapImagePath(mapKey);
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(mapKey);
  const selectedPin = visiblePins.find((pin) => pin.id === selectedPinId) ?? null;
  const viewingSharedPartyMap =
    party !== null && party.mapKey === mapKey && party.activeChannel === channel;

  /** Personal atlas focus — does not overwrite shared party.mapKey. */
  const changeMap = (next: string) => {
    setMapKey(next);
    setChannel(1);
    setSelectedPinId(null);
  };
  const changeChannel = (next: number) => {
    setChannel(next);
    setSelectedPinId(null);
  };
  const syncPartyToMyView = () => {
    if (!party) return;
    setParty(setPartyChannel(setPartyMap(party, mapKey, channel), channel));
    setNotice(`Wspólna mapa party ustawiona na ${mapKey} · CH${channel}.`);
  };
  const jumpToPartyMap = () => {
    if (!party) return;
    setMapKey(party.mapKey);
    setChannel(party.activeChannel);
    setSelectedPinId(null);
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
    if (!party) return;
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
      label: 'Metin',
      kind: 'metin',
    };
    setPins((current) => placeScoutPin(current, pin));
    setSelectedPinId(pin.id);
    setNotice('Pinezka · ~10 min · widoczna dla party na tej mapie/CH.');
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
    setNotice('Zbicie w sesji (+1). Pinezka zdjęta. (To nie Timer respawnu.)');
  };
  const markSessionKill = () => {
    setParty((current) => (current ? incrementSessionKills(current) : null));
    setNotice('Zbicie w sesji (+1). Timery respawnu są na /timers.');
  };

  return (
    <AppShell activeSection="maps" viewerName={initialSnapshot.viewerName}>
      <main className="respawn-page" id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Party</h1>
            <p>
              Osobna funkcja od Timerów. Drużyna + pinezka skauta (~10 min). Twój wybór mapy poniżej
              to <b>Twój widok</b> — wspólna mapa party zmienia się dopiero przyciskiem w panelu
              drużyny.
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
            <span>Kanał (Twój widok)</span>
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
                  {party
                    ? viewingSharedPartyMap
                      ? ' · widok = mapa party'
                      : ` · party na ${party.mapKey} CH${party.activeChannel}`
                    : ''}
                </span>
                <h2>Mapa party / skaut</h2>
                <p className="respawn-list-lead">
                  Klik mapy = pinezka (~10 min). To nie timer respawnu z /timers.
                </p>
              </div>
              {party ? (
                <div className="respawn-filters">
                  <button onClick={markSessionKill} type="button">
                    Zbite w sesji (+1)
                  </button>
                </div>
              ) : null}
            </header>

            <div className="respawn-map-stage-wrap">
              <div
                aria-label={party ? 'Mapa party — klik stawia pinezkę' : 'Mapa party'}
                className={`respawn-map-stage${party ? ' is-placing' : ''}`}
                onClick={placeOnMap}
                role={party ? 'button' : undefined}
                tabIndex={party ? 0 : undefined}
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
                {visiblePins.map((pin) => {
                  const age = scoutPinAgeMinutes(pin, now);
                  const remaining = Math.ceil(scoutPinRemainingMs(pin, now) / 60_000);
                  return (
                    <button
                      aria-label={`Pinezka · ${formatAge(age)} · znika za ~${remaining} min`}
                      className={`respawn-map-marker is-scout is-metin${
                        selectedPinId === pin.id ? ' is-selected' : ''
                      }`}
                      key={pin.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPinId(pin.id);
                        setNotice(`Pinezka: ${formatAge(age)} · znika za ~${remaining} min`);
                      }}
                      style={{ left: `${pin.location.x}%`, top: `${pin.location.y}%` }}
                      title={`${formatAge(age)} · ${pin.placedBy}`}
                      type="button"
                    >
                      <Icon name="map" size={10} />
                    </button>
                  );
                })}
              </div>
              <p className="respawn-map-help">
                {!party
                  ? 'Najpierw utwórz party obok — potem klik mapy stawia pinezkę.'
                  : 'Klik mapy = pinezka. Klik pinezki = odklik / zbicie w sesji.'}
              </p>
              {selectedPin ? (
                <div className="respawn-party-feed">
                  <span>Pinezka</span>
                  <p>
                    {formatAge(scoutPinAgeMinutes(selectedPin, now))} · {selectedPin.placedBy}
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
                  <p>
                    Wybierz swój widok mapy, stwórz drużynę. Timery respawnu zostają na{' '}
                    <a href="/timers">/timers</a>.
                  </p>
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
                  <p className="respawn-list-lead">
                    Wspólna mapa party: <b>{party.mapKey}</b> · CH{party.activeChannel}
                  </p>
                </header>
                {!viewingSharedPartyMap ? (
                  <div className="respawn-party-feed">
                    <span>Twój widok ≠ mapa party</span>
                    <button className="respawn-party-toggle" onClick={jumpToPartyMap} type="button">
                      <span /> Skocz do mapy party
                    </button>
                    <button
                      className="respawn-party-toggle is-on"
                      onClick={syncPartyToMyView}
                      type="button"
                    >
                      <span /> Ustaw mój widok jako mapę party
                    </button>
                  </div>
                ) : null}
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
          Party ≠ Timery respawnu ≠ Postęp PH. Twój widok mapy nie nadpisuje automatycznie wspólnej
          mapy party. Pinezki skauta znikają po ~10 min. Dane lokalnie.
        </p>
      </main>
    </AppShell>
  );
}
