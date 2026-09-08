'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import {
  MetinGeneralHuntApiError,
  getMetinGeneralHunt,
  putMetinGeneralHunt,
  type MetinGeneralHuntHistoryEntry,
  type MetinGeneralHuntPoint,
  type MetinGeneralHuntRequest,
  type MetinGeneralHuntRequestType,
  type MetinGeneralHuntSnapshot,
  type MetinGeneralHuntState,
} from '../../src/metin-general-hunts-api';
import {
  formatWarsawHuntClock,
  metinGeneralHuntEventCycleKey,
  nextMetinGeneralHuntSpawn,
  pickRouteColor,
  routeDisplayColor,
  smoothRoutePath,
} from '../../src/metin-general-hunt-visuals';
import { huntMapImagePath } from '../../src/hunt-map-assets';
import { useHuntViewer } from '../../src/hunt-online';
import { respawnMaps } from '../../src/respawn-timers';
import { AppShell } from '../app-shell';
import styles from './generaly-metki.module.css';

type HuntKind = 'metin' | 'general';
type MapMode = 'view' | 'route' | 'found';

type HuntDefinition = {
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

const HUNTS: readonly HuntDefinition[] = [
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

const REQUEST_LABELS: Readonly<Record<MetinGeneralHuntRequestType, string>> = {
  pvp: 'POTRZEBNY PVP',
  dps: 'POTRZEBNY DPS',
  buff: 'POTRZEBNY BUFF',
};

const REQUEST_ICONS: Readonly<Record<MetinGeneralHuntRequestType, string>> = {
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

function emptyState(huntKey: string, now = Date.now()): MetinGeneralHuntState {
  return {
    huntKey,
    eventCycleKey: metinGeneralHuntEventCycleKey(huntKey, now),
    routes: [],
    markers: [],
    requests: [],
    history: [],
  };
}

function normalizeState(
  huntKey: string,
  state: MetinGeneralHuntState | null | undefined,
  now = Date.now(),
): MetinGeneralHuntState {
  const eventCycleKey = metinGeneralHuntEventCycleKey(huntKey, now);
  if (!state || typeof state !== 'object' || state.eventCycleKey !== eventCycleKey) {
    return emptyState(huntKey, now);
  }
  return {
    huntKey,
    eventCycleKey,
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

function timeUntil(target: number, now: number): string {
  const diff = Math.max(0, target - now);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)} min`;
}

function historyLabel(entry: MetinGeneralHuntHistoryEntry): string {
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

function historyIcon(entry: MetinGeneralHuntHistoryEntry): string {
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

function historyTone(entry: MetinGeneralHuntHistoryEntry) {
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

function requestTone(type: MetinGeneralHuntRequestType) {
  switch (type) {
    case 'pvp':
      return styles.requestPvp;
    case 'dps':
      return styles.requestDps;
    case 'buff':
      return styles.requestBuff;
  }
}

export default function GeneralsMetinsPage() {
  const { viewerId, displayName, onlineEnabled, hydrated } = useHuntViewer();
  const [huntKey, setHuntKey] = useState<HuntDefinition['key']>('metin-red-las');
  const huntDefinition = HUNTS.find((hunt) => hunt.key === huntKey) ?? HUNTS[0]!;
  const [channel, setChannel] = useState(1);
  const [mode, setMode] = useState<MapMode>('view');
  const [snapshot, setSnapshot] = useState<MetinGeneralHuntSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const state = useMemo(
    () => normalizeState(huntDefinition.key, snapshot?.state, now),
    [huntDefinition.key, now, snapshot?.state],
  );

  const loadHunt = useCallback(
    async (quiet = false) => {
      if (!onlineEnabled || !viewerId) {
        setSnapshot(null);
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      try {
        let result = await getMetinGeneralHunt({ viewerId, huntKey: huntDefinition.key });
        const expectedCycleKey = metinGeneralHuntEventCycleKey(huntDefinition.key);
        if (result.state.eventCycleKey !== expectedCycleKey) {
          try {
            result = await putMetinGeneralHunt({
              viewerId,
              huntKey: huntDefinition.key,
              expectedRevision: result.revision,
              state: emptyState(huntDefinition.key),
            });
          } catch (error) {
            if (error instanceof MetinGeneralHuntApiError && error.status === 409) {
              result = await getMetinGeneralHunt({ viewerId, huntKey: huntDefinition.key });
            } else {
              throw error;
            }
          }
        }
        setSnapshot({ ...result, state: normalizeState(huntDefinition.key, result.state) });
        setNotice('');
      } catch (error) {
        if (!quiet) {
          setNotice(error instanceof Error ? error.message : 'Nie udało się pobrać polowania.');
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [onlineEnabled, huntDefinition.key, viewerId],
  );

  useEffect(() => {
    if (!hydrated) return;
    setChannel(huntDefinition.channels[0] ?? 1);
    setMode('view');
    setSnapshot(null);
    void loadHunt();
  }, [hydrated, huntDefinition.channels, loadHunt]);

  useEffect(() => {
    if (!hydrated || !onlineEnabled || !viewerId) return;
    const id = window.setInterval(() => void loadHunt(true), 1_000);
    return () => window.clearInterval(id);
  }, [hydrated, loadHunt, onlineEnabled, viewerId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const mutateHunt = useCallback(
    async (mutator: (current: MetinGeneralHuntState) => MetinGeneralHuntState) => {
      if (!onlineEnabled || !viewerId) {
        setNotice('Polowanie wymaga aktywnego połączenia z aplikacją.');
        return false;
      }
      setSaving(true);
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const base =
            attempt === 0 && snapshot
              ? snapshot
              : await getMetinGeneralHunt({ viewerId, huntKey: huntDefinition.key });
          const current = normalizeState(huntDefinition.key, base.state);
          const nextState = mutator(current);
          try {
            const result = await putMetinGeneralHunt({
              viewerId,
              huntKey: huntDefinition.key,
              expectedRevision: base.revision,
              state: nextState,
            });
            setSnapshot({ ...result, state: normalizeState(huntDefinition.key, result.state) });
            setNotice('');
            return true;
          } catch (error) {
            if (
              error instanceof MetinGeneralHuntApiError &&
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
    [huntDefinition.key, onlineEnabled, snapshot, viewerId],
  );

  const appendHistory = useCallback(
    (
      current: MetinGeneralHuntState,
      input: Omit<MetinGeneralHuntHistoryEntry, 'id' | 'createdAt' | 'userId' | 'displayName'>,
    ): readonly MetinGeneralHuntHistoryEntry[] => [
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

  const quickRequest = async (type: MetinGeneralHuntRequestType) => {
    const requestId = newId('request');
    const historyType: `need_${MetinGeneralHuntRequestType}` = `need_${type}`;
    await mutateHunt((current) => ({
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
    await mutateHunt((current) => ({
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

  const respondComing = async (request: MetinGeneralHuntRequest) => {
    if (!viewerId || request.responders.some((responder) => responder.userId === viewerId)) return;
    await mutateHunt((current) => ({
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

  const closeRequest = async (request: MetinGeneralHuntRequest) => {
    await mutateHunt((current) => ({
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

  const imagePath = huntMapImagePath(huntDefinition.mapKey);

  const handleMapClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!imagePath || mode === 'view' || saving) return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
    if (rawX < 0 || rawX > 100 || rawY < 0 || rawY > 100) return;

    const point: MetinGeneralHuntPoint = { x: rawX, y: rawY };

    if (mode === 'found') {
      const ok = await mutateHunt((current) => ({
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

    if (mode === 'route' && huntDefinition.kind === 'metin') {
      await mutateHunt((current) => {
        const routeUserId = viewerId ?? 'unknown';
        const mine = current.routes.find(
          (route) => route.userId === routeUserId && route.channel === channel,
        );
        const color = mine?.color ?? pickRouteColor(routeUserId, current.routes);
        const routes = mine
          ? current.routes.map((route) =>
              route.id === mine.id
                ? {
                    ...route,
                    color,
                    points: [...route.points, point].slice(-80),
                    updatedAt: Date.now(),
                  }
                : route,
            )
          : [
              ...current.routes,
              {
                id: newId('route'),
                userId: routeUserId,
                displayName,
                channel,
                color,
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
    await mutateHunt((current) => ({
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
    await mutateHunt((current) => ({
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
  const next = nextMetinGeneralHuntSpawn(huntDefinition.intervalHours, now);
  const ownRoute = state.routes.find(
    (route) => route.userId === viewerId && route.channel === channel,
  );

  const switchToChannel = (nextChannel: number) => {
    if (!huntDefinition.channels.includes(nextChannel)) return;
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
              Jedna mapa, szybkie komendy i wspólny stan na żywo. Wybierz wątek i CH —
              reszta ma być widoczna od razu.
            </p>
          </div>
          <div className={styles.syncBox}>
            <span className={onlineEnabled && viewerId ? styles.syncDotOnline : styles.syncDot} />
            <div>
              <strong>{onlineEnabled && viewerId ? 'Wspólny stan online' : 'Brak połączenia'}</strong>
              <small>{snapshot ? `rewizja ${snapshot.revision}` : 'oczekiwanie na dane'}</small>
            </div>
          </div>
        </header>

        <section className={styles.roomGrid} aria-label="Wątki Metinów i Generałów">
          {HUNTS.map((hunt) => (
            <button
              className={`${styles.roomCard}${hunt.key === huntDefinition.key ? ` ${styles.roomCardActive}` : ''}`}
              key={hunt.key}
              onClick={() => setHuntKey(hunt.key)}
              type="button"
            >
              <span>{hunt.kind === 'metin' ? 'METIN LEGENDARNY' : 'GENERAŁ'}</span>
              <strong>{hunt.shortLabel}</strong>
              <small>{hunt.kind === 'metin' ? 'CH1–CH3' : `CH1–CH${hunt.channels.at(-1) ?? 1}`}</small>
            </button>
          ))}
        </section>

        <section className={styles.roomHeader}>
          <div>
            <span className={styles.roomType}>
              {huntDefinition.kind === 'metin' ? 'METIN LEGENDARNY' : 'GENERAŁ'}
            </span>
            <h2>{huntDefinition.label}</h2>
            <p>Harmonogram: {scheduleHours(huntDefinition.intervalHours)}</p>
          </div>
          <div className={styles.nextSpawn}>
            <span>Następny spawn</span>
            <strong>{formatWarsawHuntClock(next)}</strong>
            <small>za {timeUntil(next, now)}</small>
          </div>
        </section>

        <nav className={styles.channelBar} aria-label="Kanał">
          {huntDefinition.channels.map((huntChannel) => (
            <button
              className={huntChannel === channel ? styles.channelActive : styles.channelButton}
              key={huntChannel}
              onClick={() => switchToChannel(huntChannel)}
              type="button"
            >
              CH{huntChannel}
            </button>
          ))}
        </nav>

        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <div className={styles.workspace}>
          <section className={styles.historyPanel}>
            <div className={styles.sectionHeading}>
              <div>
                <span>HISTORIA NA ŻYWO</span>
                <h3>{huntDefinition.shortLabel}</h3>
              </div>
              <em>{state.history.length}</em>
            </div>

            <div className={styles.historyList}>
              {state.history.length === 0 ? (
                <p className={styles.empty}>Jeszcze bez komend w tym wątku.</p>
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
                    <time>{formatWarsawHuntClock(entry.createdAt)}</time>
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

          <section className={styles.mapPanel}>
            <div className={styles.mapToolbar}>
              <div>
                <strong>🗺️ {huntDefinition.mapKey} · CH{channel}</strong>
                <span>{loading ? 'Ładowanie…' : saving ? 'Zapisywanie…' : 'Gotowe do działania'}</span>
              </div>
              <div className={styles.mapActions}>
                {huntDefinition.kind === 'metin' ? (
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
                {huntDefinition.kind === 'metin' && ownRoute ? (
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
                  aria-label={`Interaktywna mapa ${huntDefinition.mapKey} CH${channel}`}
                  className={`${styles.mapCanvas}${mode !== 'view' ? ` ${styles.mapCanvasEditing}` : ''}`}
                  onClick={(event) => void handleMapClick(event)}
                  role="presentation"
                >
                  <img
                    alt={`Mapa ${huntDefinition.mapKey}`}
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
                    {visibleRoutes.map((route) => {
                      const color = routeDisplayColor(route, visibleRoutes);
                      const path = smoothRoutePath(route.points);
                      const editing = mode === 'route' && route.userId === viewerId;
                      const first = route.points[0];
                      const last = route.points.at(-1);
                      return (
                        <g key={route.id}>
                          <title>{route.displayName}</title>
                          {route.points.length > 1 ? (
                            <>
                              <path
                                d={path}
                                fill="none"
                                opacity="0.78"
                                stroke="#02060c"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={editing ? 4 : 5}
                                vectorEffect="non-scaling-stroke"
                              />
                              <path
                                d={path}
                                fill="none"
                                opacity={editing ? 0.28 : 0.34}
                                stroke={color}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={editing ? 3.2 : 4.2}
                                vectorEffect="non-scaling-stroke"
                              />
                              <path
                                d={path}
                                fill="none"
                                stroke={color}
                                strokeDasharray={editing ? '5 3' : undefined}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={editing ? 1.7 : 2.2}
                                vectorEffect="non-scaling-stroke"
                              />
                            </>
                          ) : null}
                          {editing
                            ? route.points.map((point, index) => (
                                <circle
                                  cx={point.x}
                                  cy={point.y}
                                  fill={color}
                                  key={`${route.id}-${index}`}
                                  r="0.72"
                                  stroke="#ffffff"
                                  strokeOpacity="0.72"
                                  strokeWidth="0.32"
                                  vectorEffect="non-scaling-stroke"
                                />
                              ))
                            : null}
                          {!editing && first ? (
                            <circle
                              cx={first.x}
                              cy={first.y}
                              fill="#071018"
                              r="0.95"
                              stroke={color}
                              strokeWidth="0.58"
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : null}
                          {!editing && last && route.points.length > 1 ? (
                            <>
                              <circle
                                cx={last.x}
                                cy={last.y}
                                fill={color}
                                r="1.35"
                                stroke="#ffffff"
                                strokeWidth="0.52"
                                vectorEffect="non-scaling-stroke"
                              />
                              <circle cx={last.x} cy={last.y} fill="#ffffff" r="0.34" />
                            </>
                          ) : null}
                        </g>
                      );
                    })}
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
                          ? 'Klikaj kolejne punkty. Wyłącz „Trasa”, aby zakończyć rysowanie.'
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

            {huntDefinition.kind === 'metin' ? (
              <div className={styles.routeLegend}>
                {visibleRoutes.length === 0 ? (
                  <span>CH{channel}: nikt nie wyznaczył jeszcze trasy.</span>
                ) : (
                  visibleRoutes.map((route) => (
                    <span key={route.id}>
                      <i style={{ background: routeDisplayColor(route, visibleRoutes) }} />
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
                        <small>{formatWarsawHuntClock(request.createdAt)}</small>
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
      </main>
    </AppShell>
  );
}
