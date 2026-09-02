'use client';

import { useMemo, useState } from 'react';

import {
  confirmHuntMarker,
  filterHuntMarkers,
  getMapHuntingSummary,
  type HuntMarkerScope,
  type MapHuntSession,
  type MapHuntingSnapshot,
} from '../../src/map-hunting';
import { AppShell, Icon } from '../app-shell';

const markerScopes: ReadonlyArray<{ id: HuntMarkerScope; label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'ready', label: 'Gotowe' },
  { id: 'running', label: 'W trakcie' },
  { id: 'unknown', label: 'Do sprawdzenia' },
];

function getMarkerIcon(kind: 'boss' | 'metin') {
  return kind === 'boss' ? 'activity' : 'map';
}

export function MapHunting({ initialSnapshot }: { initialSnapshot: MapHuntingSnapshot }) {
  const [sessions, setSessions] = useState<readonly MapHuntSession[]>(initialSnapshot.sessions);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSnapshot.sessions[0]?.id ?? '');
  const [scope, setScope] = useState<HuntMarkerScope>('all');
  const [notice, setNotice] = useState('');
  const snapshot = useMemo(() => ({ ...initialSnapshot, sessions }), [initialSnapshot, sessions]);
  const summary = useMemo(() => getMapHuntingSummary(snapshot), [snapshot]);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const visibleMarkers = selectedSession ? filterHuntMarkers(selectedSession.markers, scope) : [];

  const handleConfirm = (markerId: string) => {
    if (!selectedSession) return;

    setSessions((current) =>
      current.map((session) =>
        session.id === selectedSession.id
          ? confirmHuntMarker(session, markerId, initialSnapshot.viewerName)
          : session,
      ),
    );
    setNotice(
      'Punkt na mapie potwierdzony. W wersji produkcyjnej zapis trafi do API i ustalonego kanału Discord.',
    );
  };

  return (
    <AppShell activeSection="maps" viewerName={initialSnapshot.viewerName}>
      <main className="map-hunting-page" id="main-content">
        <header className="map-hunting-hero">
          <div>
            <span className="eyebrow">Niezależny moduł</span>
            <h1>Mapy i respawny</h1>
            <p>
              Sesje polowania mają własne markery, timery i zasady powiadomień. Nie są timerami
              ksiąg, EQ ani postaci.
            </p>
          </div>
          <div className="map-hunting-hero-note">
            <Icon name="map" size={22} />
            <span>Konfiguracja jest przypisana do sesji mapy</span>
          </div>
        </header>

        <section aria-label="Podsumowanie sesji map" className="map-hunting-metrics">
          <article>
            <strong>{summary.sessionCount}</strong>
            <span>aktywne sesje</span>
          </article>
          <article>
            <strong>{summary.readyMarkers}</strong>
            <span>punkty gotowe</span>
          </article>
          <article>
            <strong>{summary.runningMarkers}</strong>
            <span>odliczania w toku</span>
          </article>
          <article>
            <strong>{summary.participantCount}</strong>
            <span>zapisy do sesji</span>
          </article>
        </section>

        <section className="map-session-switcher" aria-label="Sesje polowania">
          {sessions.map((session) => (
            <button
              aria-pressed={selectedSession?.id === session.id}
              className={selectedSession?.id === session.id ? 'is-active' : ''}
              key={session.id}
              onClick={() => {
                setSelectedSessionId(session.id);
                setScope('all');
              }}
              type="button"
            >
              <span>
                <Icon name="map" size={16} />
              </span>
              <div>
                <strong>{session.title}</strong>
                <small>
                  {session.mapName} · {session.participantCount} osób
                </small>
              </div>
              <Icon name="chevron" size={15} />
            </button>
          ))}
        </section>

        {selectedSession && (
          <div className="map-hunting-grid">
            <section className="panel map-board-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Sesja · {selectedSession.mapName}</span>
                  <h2>{selectedSession.title}</h2>
                </div>
                <span className="map-participant-chip">
                  <Icon name="team" size={14} /> {selectedSession.participantCount} zapisanych
                </span>
              </header>
              <div className="map-board">
                <div className="map-board-grid" />
                <div className="map-board-copy">
                  <span>{selectedSession.mapName}</span>
                  <small>{selectedSession.description}</small>
                </div>
                {selectedSession.markers.map((marker) => (
                  <button
                    aria-label={`${marker.name}: ${marker.respawnLabel}`}
                    className={`map-marker is-${marker.status} is-${marker.kind}`}
                    key={marker.id}
                    onClick={() => setScope('all')}
                    style={{ left: `${marker.position.x}%`, top: `${marker.position.y}%` }}
                    type="button"
                  >
                    <Icon name={getMarkerIcon(marker.kind)} size={15} />
                    <span>{marker.kind === 'boss' ? 'Boss' : 'Metin'}</span>
                  </button>
                ))}
              </div>
              <p className="map-board-help">
                Kliknij punkt na mapie, aby wrócić do pełnej listy markerów.
              </p>
            </section>

            <aside className="panel map-notification-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Powiadomienia sesji</span>
                  <h2>Oddzielna konfiguracja</h2>
                </div>
                <Icon name="bell" size={17} />
              </header>
              <dl>
                <div>
                  <dt>Kanał</dt>
                  <dd>{selectedSession.notificationTarget}</dd>
                </div>
                <div>
                  <dt>Zasada</dt>
                  <dd>{selectedSession.notificationPolicy}</dd>
                </div>
                <div>
                  <dt>Zakres</dt>
                  <dd>Tylko ta sesja i jej punkty mapy</dd>
                </div>
              </dl>
              <p>
                Właściwy zapis konfiguracji bota wymaga API i dziennika zmian — nie będzie udawanym
                przełącznikiem w interfejsie.
              </p>
            </aside>

            <section className="panel map-marker-panel">
              <header className="map-marker-toolbar">
                <div>
                  <span className="section-kicker">Punkty · {selectedSession.mapName}</span>
                  <h2>Bossy i metiny</h2>
                </div>
                <div className="map-marker-scopes" role="group" aria-label="Stan punktów">
                  {markerScopes.map((item) => (
                    <button
                      aria-pressed={scope === item.id}
                      className={scope === item.id ? 'is-active' : ''}
                      key={item.id}
                      onClick={() => setScope(item.id)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </header>
              <div className="map-marker-list">
                {visibleMarkers.map((marker) => (
                  <article className={`map-marker-row is-${marker.status}`} key={marker.id}>
                    <span className="map-marker-row-icon">
                      <Icon name={getMarkerIcon(marker.kind)} size={17} />
                    </span>
                    <div>
                      <div className="map-marker-row-title">
                        <strong>{marker.name}</strong>
                        <span>{marker.kind === 'boss' ? 'Boss' : 'Metin'}</span>
                      </div>
                      <p>
                        {marker.intervalLabel} ·{' '}
                        {marker.lastConfirmedBy
                          ? `potwierdził ${marker.lastConfirmedBy} ${marker.lastConfirmedLabel}`
                          : 'brak ostatniego potwierdzenia'}
                      </p>
                    </div>
                    <div className="map-marker-row-action">
                      <span className={`timer-chip is-${marker.status}`}>
                        <Icon name="clock" size={13} /> {marker.respawnLabel}
                      </span>
                      {marker.status !== 'running' && (
                        <button onClick={() => handleConfirm(marker.id)} type="button">
                          Potwierdź
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {visibleMarkers.length === 0 && (
                  <div className="map-marker-empty">Brak punktów w tym stanie.</div>
                )}
              </div>
            </section>
          </div>
        )}
        <p aria-live="polite" className="sr-only">
          {notice}
        </p>
        <div className="mock-notice">
          Mapa jest odrębnym modułem. Dzisiejsze potwierdzenia działają w widoku demonstracyjnym;
          trwały zapis i wysyłka Discord będą podłączone przez API, z audytem zmian.
        </div>
      </main>
    </AppShell>
  );
}
