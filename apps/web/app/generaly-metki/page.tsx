'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import {
  FixedHuntRoomApiError,
  getFixedHuntRoom,
  putFixedHuntRoom,
  type FixedHuntHistoryEntry,
  type FixedHuntRequest,
  type FixedHuntRequestType,
  type FixedHuntRoomPoint,
  type FixedHuntRoomSnapshot,
  type FixedHuntRoomState,
} from '../../src/fixed-hunt-rooms-api';
import { huntMapImagePath } from '../../src/hunt-map-assets';
import { useHuntViewer } from '../../src/hunt-online';
import { respawnMaps } from '../../src/respawn-timers';
import { AppShell } from '../app-shell';
import styles from './generaly-metki.module.css';

type HuntKind = 'metin' | 'general';
type MapMode = 'view' | 'route' | 'found';

type RoomDefinition = {
  readonly key: 'metin-red-las' | 'metin-v1' | 'general-v1' | 'metin-v2' | 'general-v2';
  readonly label: string;
  readonly shortLabel: string;
  readonly mapKey: 'Czerwony Las' | 'Atlantyda V1' | 'Atlantyda V2';
  readonly kind: HuntKind;
  readonly intervalHours: 4 | 6;
  readonly channels: readonly number[];
};

function mapChannels(mapKey: string): readonly number[] {
  const count = respawnMaps.find((map) => map.key === mapKey)?.channels ?? 8;
  return Array.from({ length: count }, (_, index) => index + 1);
}

const ROOMS: readonly RoomDefinition[] = [
  {
    key: 'metin-red-las',
    label: 'Red Las — Metin Legendarny',
    shortLabel: 'Red Las · Metin',
    mapKey: 'Czerwony Las',
    kind: 'metin',
    intervalHours: 6,
    channels: [1, 2, 3],
  },
  {
    key: 'metin-v1',
    label: 'V1 — Metin Legendarny',
    shortLabel: 'V1 · Metin',
    mapKey: 'Atlantyda V1',
    kind: 'metin',
    intervalHours: 6,
    channels: [1, 2, 3],
  },
  {
    key: 'general-v1',
    label: 'V1 — Generał',
    shortLabel: 'V1 · Generał',
    mapKey: 'Atlantyda V1',
    kind: 'general',
    intervalHours: 4,
    channels: mapChannels('Atlantyda V1'),
  },
  {
    key: 'metin-v2',
    label: 'V2 — Metin Legendarny',
    shortLabel: 'V2 · Metin',
    mapKey: 'Atlantyda V2',
    kind: 'metin',
    intervalHours: 6,
    channels: [1, 2, 3],
  },
  {
    key: 'general-v2',
    label: 'V2 — Generał',
    shortLabel: 'V2 · Generał',
    mapKey: 'Atlantyda V2',
    kind: 'general',
    intervalHours: 4,
    channels: mapChannels('Atlantyda V2'),
  },
];

const REQUEST_LABELS: Readonly<Record<FixedHuntRequestType, string>> = {
  pvp: 'POTRZEBNY PVP',
  dps: 'POTRZEBNY DPS',
  buff: 'POTRZEBNY BUFF',
};

const REQUEST_ICONS: Readonly<Record<FixedHuntRequestType, string>> = {
  pvp: '⚔️',
  dps: '💥',
  buff: '✨',
};

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function emptyState(roomKey: string): FixedHuntRoomState {
  return { roomKey, routes: [], markers: [], requests: [], history: [] };
}

function normalizeState(
  roomKey: string,
  state: FixedHuntRoomState | null | undefined,
): FixedHuntRoomState {
  if (!state || typeof state !== 'object') return emptyState(roomKey);
  return {
    roomKey,
    routes: Array.isArray(state.routes) ? state.routes : [],
    markers: Array.isArray(state.markers) ? state.markers : [],
    requests: Array.isArray(state.requests) ? state.requests : [],
    history: Array.isArray(state.history) ? state.history : [],
  };
}

function scheduleHours(intervalHours: number): string {
  return Array.from({ length: 24 / intervalHours }, (_, index) =>
    `${String(index * intervalHours).padStart(2, '0')}:00`,
  ).join(' · ');
}

function nextSpawn(intervalHours: number, now: number): Date {
  const current = new Date(now);
  const start = new Date(current);
  start.setHours(0, 0, 0, 0);
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const elapsed = Math.max(0, current.getTime() - start.getTime());
  const slot = Math.floor(elapsed / intervalMs) + 1;
  return new Date(start.getTime() + slot * intervalMs);
}

function timeUntil(target: Date, now: number): string {
  const diff = Math.max(0, target.getTime() - now);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)} min`;
}

function formatClock(value: number): string {
  return new Date(value).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function historyLabel(entry: FixedHuntHistoryEntry): string {
  switch (entry.type) {
    case 'killed':
      return 'ZBITY';
    case 'need_pvp':
      return 'POTRZEBNY PVP';
    case 'need_dps':
      return 'POTRZEBNY DPS';
    case 'need_buff':
      return 'POTRZEBNY BUFF';
    case 'coming':
      return `IDĘ${entry.requestType ? ` → ${REQUEST_LABELS[entry.requestType].replace('POTRZEBNY ', '')}` : ''}`;
    case 'found':
      return 'ZNALEZIONY';
    case 'request_closed':
      return 'POMOC OGARNIĘTA';
  }
}

function historyIcon(entry: FixedHuntHistoryEntry): string {
  switch (entry.type) {
    case 'killed':
      return '✅';
    case 'need_pvp':
      return '⚔️';
    case 'need_dps':
      return '💥';
    case 'need_buff':
      return '✨';
    case 'coming':
      return '🏃';
    case 'found':
      return '📍';
    case 'request_closed':
      return '✔️';
  }
}

function historyTone(entry: FixedHuntHistoryEntry): string {
  switch (entry.type) {
    case 'killed':
      return styles.historyKilled;
    case 'need_pvp':
      return styles.historyPvp;
    case 'need_dps':
      return styles.historyDps;
    case 'need_buff':
      return styles.historyBuff;
    case 'coming':
      return styles.historyComing;
    case 'found':
      return styles.historyFound;
    case 'request_closed':
      return styles.historyClosed;
  }
}

function requestTone(type: FixedHuntRequestType): string {
  switch (type) {
    case 'pvp':
      return styles.requestPvp;
    case 'dps':
      return styles.requestDps;
    case 'buff':
      return styles.requestBuff;
  }
}

function routeColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360} 72% 62%)`;
}

export default function GeneralsMetinsPage() {
  const { viewerId, displayName, onlineEnabled, hydrated } = useHuntViewer();
  const [roomKey, setRoomKey] = useState<RoomDefinition['key']>('metin-red-las');
  const roomDefinition = ROOMS.find((room) => room.key === roomKey) ?? ROOMS[0]!;
  const [channel, setChannel] = useState(1);
  const [mode, setMode] = useState<MapMode>('view');
  const [snapshot, setSnapshot] = useState<FixedHuntRoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const state = useMemo(
    () => normalizeState(roomDefinition.key, snapshot?.state),
    [roomDefinition.key, snapshot?.state],
  );

  const loadRoom = useCallback(
    async (quiet = false) => {
      if (!onlineEnabled || !viewerId) {
        setSnapshot(null);
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      try {
        const result = await getFixedHuntRoom({ viewerId, roomKey: roomDefinition.key });
        setSnapshot({ ...result, state: normalizeState(roomDefinition.key, result.state) });
        setNotice('');
      } catch (error) {
        if (!quiet) {
          setNotice(error instanceof Error ? error.message : 'Nie udało się pobrać pokoju.');
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [onlineEnabled, roomDefinition.key, viewerId],
  );

  useEffect(() => {
    if (!hydrated) return;
    setChannel(roomDefinition.channels[0] ?? 1);
    setMode('view');
    setSnapshot(null);
    void loadRoom();
  }, [hydrated, loadRoom, roomDefinition.channels]);

  useEffect(() => {
    if (!hydrated || !onlineEnabled || !viewerId) return;
    const id = window.setInterval(() => void loadRoom(true), 1_000);
    return () => window.clearInterval(id);
  }, [hydrated, loadRoom, onlineEnabled, viewerId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const mutateRoom = useCallback(
    async (mutator: (current: FixedHuntRoomState) => FixedHuntRoomState) => {
      if (!onlineEnabled || !viewerId) {
        setNotice('Pokój wymaga aktywnego połączenia z aplikacją.');
        return false;
      }
      setSaving(true);
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const base =
            attempt === 0 && snapshot
              ? snapshot
              : await getFixedHuntRoom({ viewerId, roomKey: roomDefinition.key });
          const current = normalizeState(roomDefinition.key, base.state);
          const nextState = mutator(current);
          try {
            const result = await putFixedHuntRoom({
              viewerId,
              roomKey: roomDefinition.key,
              expectedRevision: base.revision,
              state: nextState,
            });
            setSnapshot({ ...result, state: normalizeState(roomDefinition.key, result.state) });
            setNotice('');
            return true;
          } catch (error) {
            if (
              error instanceof FixedHuntRoomApiError &&
              error.status === 409 &&
              attempt < 2
            ) {
              continue;
            }
            throw error;
          }
        }
        return false;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Nie udało się zapisać zmiany.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onlineEnabled, roomDefinition.key, snapshot, viewerId],
  );

  const appendHistory = useCallback(
    (
      current: FixedHuntRoomState,
      input: Omit<FixedHuntHistoryEntry, 'id' | 'createdAt' | 'userId' | 'displayName'>,
    ): readonly FixedHuntHistoryEntry[] => [
      {
        id: newId('event'),
        createdAt: Date.now(),
        userId: viewerId ?? 'unknown',
        displayName,
        ...input,
      },
      ...current.history,
    ].slice(0, 150),
    [displayName, viewerId],
  );

  const quickRequest = async (type: FixedHuntRequestType) => {
    const requestId = newId('request');
    const historyType: `need_${FixedHuntRequestType}` = `need_${type}`;
    await mutateRoom((current) => ({
      ...current,
      requests: [
        {
          id: requestId,
          type,
          channel,
          userId: viewerId ?? 'unknown',
          displayName,
          status: 'active',
          responders: [],
          createdAt: Date.now(),
          closedAt: null,
        },
        ...current.requests,
      ].slice(0, 60),
      history: appendHistory(current, {
        type: historyType,
        channel,
        requestId,
        requestType: type,
      }),
    }));
  };

  const markKilled = async () => {
    await mutateRoom((current) => ({
      ...current,
      routes: current.routes.filter((route) => route.channel !== channel),
      markers: current.markers.filter((marker) => marker.channel !== channel),
      requests: current.requests.map((request) =>
        request.channel === channel && request.status === 'active'
          ? { ...request, status: 'closed' as const, closedAt: Date.now() }
          : request,
      ),
      history: appendHistory(current, { type: 'killed', channel }),
    }));
    setMode('view');
  };

  const respondComing = async (request: FixedHuntRequest) => {
    if (!viewerId || request.responders.some((responder) => responder.userId === viewerId)) return;
    await mutateRoom((current) => ({
      ...current,
      requests: current.requests.map((candidate) =>
        candidate.id === request.id
          ? {
              ...candidate,
              responders: [
                ...candidate.responders,
                { userId: viewerId, displayName, createdAt: Date.now() },
              ],
            }
          : candidate,
      ),
      history: appendHistory(current, {
        type: 'coming',
        channel: request.channel,
        requestId: request.id,
        requestType: request.type,
      }),
    }));
  };

  const closeRequest = async (request: FixedHuntRequest) => {
    await mutateRoom((current) => ({
      ...current,
      requests: current.requests.map((candidate) =>
        candidate.id === request.id
          ? { ...candidate, status: 'closed' as const, closedAt: Date.now() }
          : candidate,
      ),
      history: appendHistory(current, {
        type: 'request_closed',
        channel: request.channel,
        requestId: request.id,
        requestType: request.type,
      }),
    }));
  };

  const imagePath = huntMapImagePath(roomDefinition.mapKey);

  const handleMapClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!imagePath || mode === 'view' || saving) return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
    if (rawX < 0 || rawX > 100 || rawY < 0 || rawY > 100) return;

    const point: FixedHuntRoomPoint = { x: rawX, y: rawY };

    if (mode === 'found') {
      const ok = await mutateRoom((current) => ({
        ...current,
        markers: [
          ...current.markers.filter((marker) => marker.channel !== channel),
          {
            id: newId('found'),
            userId: viewerId ?? 'unknown',
            displayName,
            channel,
            kind: 'found' as const,
            location: point,
            createdAt: Date.now(),
          },
        ],
        history: appendHistory(current, { type: 'found', channel }),
      }));
      if (ok) setMode('view');
      return;
    }

    if (mode === 'route' && roomDefinition.kind === 'metin') {
      await mutateRoom((current) => {
        const mine = current.routes.find(
          (route) => route.userId === viewerId && route.channel === channel,
        );
        const routes = mine
          ? current.routes.map((route) =>
              route.id === mine.id
                ? { ...route, points: [...route.points, point].slice(-80), updatedAt: Date.now() }
                : route,
            )
          : [
              ...current.routes,
              {
                id: newId('route'),
                userId: viewerId ?? 'unknown',
                displayName,
                channel,
                points: [point],
                updatedAt: Date.now(),
              },
            ];
        return { ...current, routes };
      });
    }
  };

  const undoRoutePoint = async () => {
    if (!viewerId) return;
    await mutateRoom((current) => ({
      ...current,
      routes: current.routes.flatMap((route) => {
        if (route.userId !== viewerId || route.channel !== channel) return [route];
        const points = route.points.slice(0, -1);
        return points.length > 0 ? [{ ...route, points, updatedAt: Date.now() }] : [];
      }),
    }));
  };

  const clearOwnRoute = async () => {
    if (!viewerId) return;
    await mutateRoom((current) => ({
      ...current,
      routes: current.routes.filter(
        (route) => !(route.userId === viewerId && route.channel === channel),
      ),
    }));
  };

  const visibleRoutes = state.routes.filter((route) => route.channel === channel);
  const visibleMarkers = state.markers.filter((marker) => marker.channel === channel);
  const activeRequests = state.requests
    .filter((request) => request.status === 'active')
    .sort((left, right) => right.createdAt - left.createdAt);
  const next = nextSpawn(roomDefinition.intervalHours, now);
  const ownRoute = state.routes.find(
    (route) => route.userId === viewerId && route.channel === channel,
  );

  const switchToChannel = (nextChannel: number) => {
    if (!roomDefinition.channels.includes(nextChannel)) return;
    setChannel(nextChannel);
    setMode('view');
  };

  return (
    <AppShell activeSection="generaly-metki" viewerName={displayName}>
      <main className={styles.page} id="main-content">
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>CENTRUM POLOWAŃ</span>
            <h1>Generały / Metiny</h1>
            <p>
              Jedna mapa, szybkie komendy i wspólny stan na żywo. Wybierz pokój i CH —
              reszta ma być widoczna od razu.
            </p>
          </div>
          <div className={styles.syncBox}>
            <span className={onlineEnabled && viewerId ? styles.syncDotOnline : styles.syncDot} />
            <div>
              <strong>{onlineEnabled && viewerId ? 'Wspólny stan online' : 'Brak połączenia'}</strong>
              <small>{snapshot ? `rewizja ${snapshot.revision}` : 'oczekiwanie na pokój'}</small>
            </div>
          </div>
        </header>

        <section className={styles.roomGrid} aria-label="Stałe pokoje polowania">
          {ROOMS.map((room) => (
            <button
              className={`${styles.roomCard}${room.key === roomDefinition.key ? ` ${styles.roomCardActive}` : ''}`}
              key={room.key}
              onClick={() => setRoomKey(room.key)}
              type="button"
            >
              <span>{room.kind === 'metin' ? 'METIN LEGENDARNY' : 'GENERAŁ'}</span>
              <strong>{room.shortLabel}</strong>
              <small>{room.kind === 'metin' ? 'CH1–CH3' : `CH1–CH${room.channels.at(-1) ?? 1}`}</small>
            </button>
          ))}
        </section>

        <section className={styles.roomHeader}>
          <div>
            <span className={styles.roomType}>
              {roomDefinition.kind === 'metin' ? 'METIN LEGENDARNY' : 'GENERAŁ'}
            </span>
            <h2>{roomDefinition.label}</h2>
            <p>Harmonogram: {scheduleHours(roomDefinition.intervalHours)}</p>
          </div>
          <div className={styles.nextSpawn}>
            <span>Następny spawn</span>
            <strong>{next.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</strong>
            <small>za {timeUntil(next, now)}</small>
          </div>
        </section>

        <nav className={styles.channelBar} aria-label="Kanał">
          {roomDefinition.channels.map((roomChannel) => (
            <button
              className={roomChannel === channel ? styles.channelActive : styles.channelButton}
              key={roomChannel}
              onClick={() => switchToChannel(roomChannel)}
              type="button"
            >
              CH{roomChannel}
            </button>
          ))}
        </nav>

        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <div className={styles.workspace}>
          <section className={styles.mapPanel}>
            <div className={styles.mapToolbar}>
              <div>
                <strong>🗺️ {roomDefinition.mapKey} · CH{channel}</strong>
                <span>{loading ? 'Ładowanie…' : saving ? 'Zapisywanie…' : 'Gotowe do działania'}</span>
              </div>
              <div className={styles.mapActions}>
                {roomDefinition.kind === 'metin' ? (
                  <button
                    className={mode === 'route' ? styles.toolRouteActive : styles.toolButton}
                    disabled={!imagePath || saving}
                    onClick={() => setMode((current) => (current === 'route' ? 'view' : 'route'))}
                    type="button"
                  >
                    ✏️ Trasa
                  </button>
                ) : null}
                <button
                  className={mode === 'found' ? styles.toolFoundActive : styles.toolButton}
                  disabled={!imagePath || saving}
                  onClick={() => setMode((current) => (current === 'found' ? 'view' : 'found'))}
                  type="button"
                >
                  📍 Znalazłem
                </button>
                {roomDefinition.kind === 'metin' && ownRoute ? (
                  <>
                    <button
                      className={styles.toolButton}
                      disabled={saving}
                      onClick={() => void undoRoutePoint()}
                      type="button"
                    >
                      ↶ Cofnij
                    </button>
                    <button
                      className={styles.toolButton}
                      disabled={saving}
                      onClick={() => void clearOwnRoute()}
                      type="button"
                    >
                      🧹 Wyczyść
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className={styles.mapFrame}>
              {imagePath ? (
                <div
                  aria-label={`Interaktywna mapa ${roomDefinition.mapKey} CH${channel}`}
                  className={`${styles.mapCanvas}${mode !== 'view' ? ` ${styles.mapCanvasEditing}` : ''}`}
                  onClick={(event) => void handleMapClick(event)}
                  role="presentation"
                >
                  <img
                    alt={`Mapa ${roomDefinition.mapKey}`}
                    className={styles.mapImage}
                    draggable={false}
                    src={imagePath}
                  />
                  <svg
                    aria-hidden
                    className={styles.routeLayer}
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    {visibleRoutes.map((route) => (
                      <g key={route.id}>
                        {route.points.length > 1 ? (
                          <polyline
                            fill="none"
                            points={route.points.map((point) => `${point.x},${point.y}`).join(' ')}
                            stroke={routeColor(route.userId)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="0.85"
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null}
                        {route.points.map((point, index) => (
                          <circle
                            cx={point.x}
                            cy={point.y}
                            fill={routeColor(route.userId)}
                            key={`${route.id}-${index}`}
                            r="0.85"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    ))}
                  </svg>

                  {visibleMarkers.map((marker) => (
                    <div
                      className={styles.foundMarker}
                      key={marker.id}
                      style={{ left: `${marker.location.x}%`, top: `${marker.location.y}%` }}
                      title={`${marker.displayName} · CH${marker.channel}`}
                    >
                      <span>📍</span>
                    </div>
                  ))}

                  {mode !== 'view' ? (
                    <div className={styles.mapHint}>
                      <strong>{mode === 'route' ? '✏️ RYSOWANIE TRASY' : '📍 ZAZNACZANIE'}</strong>
                      <span>
                        {mode === 'route'
                          ? 'Klikaj kolejne punkty wyłącznie na mapie'
                          : 'Kliknij dokładne miejsce na mapie'}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.mapUnavailable}>
                  <strong>Brak grafiki mapy</strong>
                  <span>Rysowanie i zaznaczanie są zablokowane.</span>
                </div>
              )}
            </div>

            {roomDefinition.kind === 'metin' ? (
              <div className={styles.routeLegend}>
                {visibleRoutes.length === 0 ? (
                  <span>CH{channel}: nikt nie wyznaczył jeszcze trasy.</span>
                ) : (
                  visibleRoutes.map((route) => (
                    <span key={route.id}>
                      <i style={{ background: routeColor(route.userId) }} />
                      {route.displayName} · {route.points.length} pkt
                    </span>
                  ))
                )}
              </div>
            ) : null}
          </section>

          <aside className={styles.sidePanel}>
            <section className={styles.quickPanel}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>SZYBKIE KOMENDY</span>
                  <h3>CH{channel}</h3>
                </div>
                <em>1 klik</em>
              </div>

              <div className={styles.commandGrid}>
                <button
                  className={styles.killedButton}
                  disabled={saving}
                  onClick={() => void markKilled()}
                  type="button"
                >
                  <span>✅</span>
                  <strong>ZBITY</strong>
                </button>
                <button
                  className={styles.pvpButton}
                  disabled={saving}
                  onClick={() => void quickRequest('pvp')}
                  type="button"
                >
                  <span>⚔️</span>
                  <strong>POTRZEBNY PVP</strong>
                </button>
                <button
                  className={styles.dpsButton}
                  disabled={saving}
                  onClick={() => void quickRequest('dps')}
                  type="button"
                >
                  <span>💥</span>
                  <strong>POTRZEBNY DPS</strong>
                </button>
                <button
                  className={styles.buffButton}
                  disabled={saving}
                  onClick={() => void quickRequest('buff')}
                  type="button"
                >
                  <span>✨</span>
                  <strong>POTRZEBNY BUFF</strong>
                </button>
              </div>
            </section>

            <section className={styles.requestsPanel}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>AKTYWNE</span>
                  <h3>Potrzebna pomoc</h3>
                </div>
                <em>{activeRequests.length}</em>
              </div>

              <div className={styles.requestList}>
                {activeRequests.length === 0 ? (
                  <p className={styles.empty}>Brak aktywnych zgłoszeń.</p>
                ) : null}
                {activeRequests.map((request) => {
                  const alreadyComing = request.responders.some(
                    (responder) => responder.userId === viewerId,
                  );
                  return (
                    <article
                      className={`${styles.requestCard} ${requestTone(request.type)}`}
                      key={request.id}
                    >
                      <header>
                        <button
                          className={styles.requestChannel}
                          onClick={() => switchToChannel(request.channel)}
                          type="button"
                        >
                          CH{request.channel}
                        </button>
                        <strong>
                          {REQUEST_ICONS[request.type]} {REQUEST_LABELS[request.type]}
                        </strong>
                        <small>{formatClock(request.createdAt)}</small>
                      </header>
                      <p>Zgłosił: {request.displayName}</p>
                      {request.responders.length > 0 ? (
                        <div className={styles.responders}>
                          <span>🏃 IDĄ:</span>{' '}
                          {request.responders.map((responder) => responder.displayName).join(', ')}
                        </div>
                      ) : null}
                      <footer>
                        <button
                          className={alreadyComing ? styles.comingDone : styles.comingButton}
                          disabled={alreadyComing || saving}
                          onClick={() => void respondComing(request)}
                          type="button"
                        >
                          {alreadyComing ? '🏃 IDĘ ✓' : '🏃 IDĘ'}
                        </button>
                        {request.userId === viewerId ? (
                          <button
                            className={styles.closeButton}
                            disabled={saving}
                            onClick={() => void closeRequest(request)}
                            type="button"
                          >
                            ✔️ Ogarnięte
                          </button>
                        ) : null}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>

        <section className={styles.historyPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <span>HISTORIA NA ŻYWO</span>
              <h3>{roomDefinition.shortLabel}</h3>
            </div>
            <em>{state.history.length}</em>
          </div>

          <div className={styles.historyList}>
            {state.history.length === 0 ? (
              <p className={styles.empty}>Jeszcze bez komend w tym pokoju.</p>
            ) : null}

            {state.history.map((entry) => {
              const isHelpEntry =
                entry.type === 'need_pvp' ||
                entry.type === 'need_dps' ||
                entry.type === 'need_buff';
              const linkedRequest =
                isHelpEntry && entry.requestId
                  ? activeRequests.find((request) => request.id === entry.requestId)
                  : undefined;
              const canRespond =
                linkedRequest !== undefined &&
                !linkedRequest.responders.some((responder) => responder.userId === viewerId);

              return (
                <div
                  className={`${styles.historyRow} ${historyTone(entry)}`}
                  key={entry.id}
                >
                  <span className={styles.historyIcon}>{historyIcon(entry)}</span>
                  <time>{formatClock(entry.createdAt)}</time>
                  <button
                    className={styles.historyChannel}
                    onClick={() => switchToChannel(entry.channel)}
                    type="button"
                  >
                    CH{entry.channel}
                  </button>
                  <strong>{entry.displayName}</strong>
                  <span className={styles.historyMessage}>{historyLabel(entry)}</span>
                  {linkedRequest ? (
                    <button
                      className={canRespond ? styles.historyComingButton : styles.historyComingDone}
                      disabled={!canRespond || saving}
                      onClick={() => void respondComing(linkedRequest)}
                      type="button"
                    >
                      {canRespond ? '🏃 IDĘ' : '✓'}
                    </button>
                  ) : (
                    <span className={styles.historySpacer} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
