'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import { huntMapImagePath } from '../../src/hunt-map-assets';
import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  PARTY_HUNT_SNAPSHOT_VERSION,
  type PartyHuntSnapshotV1,
} from '../../src/hunt-snapshot';
import { huntStatusLabel, useHuntViewer, type HuntConnectionStatus } from '../../src/hunt-online';
import { loadHuntFieldsFromServer, putPartyHuntField } from '../../src/player-team-field-sync';
import {
  addPartyRoomPin,
  createPartyRoom,
  getPartyRoom,
  joinPartyRoom,
  leavePartyRoom,
  patchPartyRoom,
  removePartyRoomPin,
  type PartyRoomSnapshot,
} from '../../src/player-team-rooms-api';
import {
  PARTY_SCOUT_PIN_TTL_MS,
  SCOUT_PIN_KIND_PRESETS,
  activeScoutPins,
  createMapParty,
  dismissScoutPin,
  formatScoutPinRemaining,
  incrementSessionKills,
  joinPartyByCode,
  partyActiveScoutPins,
  placeScoutPin,
  pruneExpiredScoutPins,
  requestPartyJoin,
  resetSessionKills,
  resolvePartyRequest,
  scoutPinAgeMinutes,
  scoutPinKindLabel,
  scoutPinRemainingMs,
  setPartyChannel,
  setPartyMap,
  togglePartyVisibility,
  type MapParty,
  type PartyScoutPin,
  type PartyVisibility,
  type ScoutPinKind,
} from '../../src/map-party';
import { respawnMaps, type RespawnLocation } from '../../src/respawn-timers';
import { AppShell } from '../app-shell';
import styles from './map-hunting.module.css';

/** Party map list: catalog entries that still have atlas images. */
const partyMaps = respawnMaps.filter((candidate) => huntMapImagePath(candidate.key) !== null);

interface LocalPartyState {
  readonly party: MapParty | null;
  readonly pins: readonly PartyScoutPin[];
  /** Last closed party kept for local join-by-code after leave. */
  readonly savedClosedParty: MapParty | null;
}

const STORAGE_KEY = 'destiled:map-party:v2';
const MINI_MODE_STORAGE_KEY = 'destiled:party-mini-mode:v1';

function MapPinGlyph() {
  return (
    <svg
      aria-hidden
      className={`${styles.pinGlyph} ${styles.pinGlyphScout}`}
      viewBox="0 0 24 36"
      width={16}
      height={24}
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

function formatAge(minutes: number): string {
  if (minutes <= 0) return 'przed chwilą';
  if (minutes === 1) return '1 min temu';
  return `${minutes} min temu`;
}

function pinMarkerClass(kind: ScoutPinKind): string {
  if (kind === 'boss') return 'is-boss';
  if (kind === 'metin') return 'is-metin';
  return 'is-scout';
}

export function PartyHunt({ initialSnapshot }: { readonly initialSnapshot: MapHuntingSnapshot }) {
  const [mapKey, setMapKey] = useState((partyMaps[0] ?? respawnMaps[0])?.key ?? '');
  const map = respawnMaps.find((candidate) => candidate.key === mapKey) ?? respawnMaps[0];
  const [channel, setChannel] = useState(1);
  const [party, setParty] = useState<MapParty | null>(null);
  const [savedClosedParty, setSavedClosedParty] = useState<MapParty | null>(null);
  const [pins, setPins] = useState<readonly PartyScoutPin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [pinKind, setPinKind] = useState<ScoutPinKind>('metin');
  const [pinCustomLabel, setPinCustomLabel] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failedMapImages, setFailedMapImages] = useState<readonly string[]>([]);
  const [miniMode, setMiniMode] = useState(false);
  const { viewerId, displayName, onlineEnabled, hydrated: storeHydrated } = useHuntViewer();
  const [connectionStatus, setConnectionStatus] = useState<HuntConnectionStatus>('offline');
  const [partyRoomId, setPartyRoomId] = useState<string | null>(null);
  const [partyRevision, setPartyRevision] = useState<number | null>(null);
  const personalSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as LocalPartyState;
        if (saved.party === null || typeof saved.party === 'object') {
          const catalogKeys = new Set(
            (partyMaps.length > 0 ? partyMaps : respawnMaps).map((m) => m.key),
          );
          const fallbackKey = (partyMaps[0] ?? respawnMaps[0])?.key ?? '';
          const migrateParty = (value: MapParty | null): MapParty | null => {
            if (!value || typeof value !== 'object') return null;
            const members = Array.isArray(value.members) ? value.members : [];
            const requests = Array.isArray(value.requests) ? value.requests : [];
            const nextMapKey = catalogKeys.has(value.mapKey) ? value.mapKey : fallbackKey;
            return {
              ...value,
              id: typeof value.id === 'string' ? value.id : `party-migrated-${Date.now()}`,
              name: typeof value.name === 'string' ? value.name : `Party · ${nextMapKey}`,
              leaderId:
                typeof value.leaderId === 'string' ? value.leaderId : members[0]?.id ?? 'unknown',
              visibility: value.visibility === 'closed' ? 'closed' : 'open',
              joinCode: typeof value.joinCode === 'string' ? value.joinCode : '',
              mapKey: nextMapKey,
              activeChannel:
                typeof value.activeChannel === 'number' && value.activeChannel >= 1
                  ? value.activeChannel
                  : 1,
              members,
              requests,
              sessionKills: typeof value.sessionKills === 'number' ? value.sessionKills : 0,
            };
          };
          const migrated = migrateParty(saved.party ?? null);
          setParty(migrated);
          const closedSaved =
            saved.savedClosedParty && typeof saved.savedClosedParty === 'object'
              ? migrateParty(saved.savedClosedParty)
              : migrated && migrated.visibility === 'closed'
                ? migrated
                : null;
          setSavedClosedParty(closedSaved);
          if (migrated) {
            setMapKey(migrated.mapKey);
            setChannel(migrated.activeChannel);
          }
        }
        if (Array.isArray(saved.pins)) {
          const validPins = saved.pins.filter(
            (pin): pin is PartyScoutPin =>
              !!pin &&
              typeof pin === 'object' &&
              typeof pin.id === 'string' &&
              typeof pin.partyId === 'string' &&
              typeof pin.mapKey === 'string' &&
              typeof pin.channel === 'number' &&
              typeof pin.placedAt === 'number' &&
              !!pin.location &&
              typeof pin.location.x === 'number' &&
              typeof pin.location.y === 'number',
          );
          setPins(pruneExpiredScoutPins(validPins, Date.now()));
        }
      }
    } catch {
      /* empty party */
    } finally {
      setLoaded(true);
    }
  }, []);

  const applyPartyRoom = useCallback((room: PartyRoomSnapshot) => {
    applyingRemoteRef.current = true;
    setPartyRoomId(room.id);
    setPartyRevision(room.revision);
    setParty({
      id: room.id,
      name: room.name,
      leaderId: room.leaderId,
      visibility: room.visibility,
      joinCode: room.joinCode,
      mapKey: room.mapKey,
      activeChannel: room.activeChannel,
      members: room.members,
      requests: room.requests,
      sessionKills: room.sessionKills,
    });
    setPins(room.pins);
    if (room.visibility === 'closed') {
      setSavedClosedParty({
        id: room.id,
        name: room.name,
        leaderId: room.leaderId,
        visibility: room.visibility,
        joinCode: room.joinCode,
        mapKey: room.mapKey,
        activeChannel: room.activeChannel,
        members: room.members,
        requests: room.requests,
        sessionKills: room.sessionKills,
      });
    }
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, []);

  // Personal partyHunt + resume room on enter.
  useEffect(() => {
    if (!loaded || !storeHydrated) return;
    if (!onlineEnabled || !viewerId) {
      setConnectionStatus('offline');
      return;
    }
    let cancelled = false;
    setConnectionStatus('connecting');
    void (async () => {
      const loadedFields = await loadHuntFieldsFromServer({ viewerId });
      if (cancelled) return;
      if (!loadedFields.ok) {
        setConnectionStatus('error');
        return;
      }
      const snap = loadedFields.partyHunt;
      if (snap) {
        applyingRemoteRef.current = true;
        if (snap.mapKey) setMapKey(snap.mapKey);
        if (snap.channel) setChannel(snap.channel);
        setMiniMode(snap.miniMode === true);
        if (snap.party) setParty(snap.party);
        if (snap.pins) setPins(snap.pins);
        if (snap.savedClosedParty) setSavedClosedParty(snap.savedClosedParty);
        if (snap.partyRoomId) setPartyRoomId(snap.partyRoomId);
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
        if (snap.partyRoomId) {
          try {
            const room = await getPartyRoom({ viewerId, roomId: snap.partyRoomId });
            if (!cancelled) applyPartyRoom(room);
          } catch {
            /* room may be gone */
          }
        }
      }
      if (!cancelled) setConnectionStatus('online');
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPartyRoom, loaded, onlineEnabled, storeHydrated, viewerId]);

  // Poll shared party room.
  useEffect(() => {
    if (!loaded || !onlineEnabled || !viewerId || !partyRoomId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const room = await getPartyRoom({ viewerId, roomId: partyRoomId });
        if (cancelled) return;
        applyPartyRoom(room);
        setConnectionStatus('online');
      } catch {
        if (!cancelled) setConnectionStatus((s) => (s === 'online' ? 'error' : s));
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyPartyRoom, loaded, onlineEnabled, partyRoomId, viewerId]);

  // Personal partyHunt prefs/cache PUT.
  useEffect(() => {
    if (!loaded || applyingRemoteRef.current) return;
    if (!onlineEnabled || !viewerId) return;
    if (personalSyncTimerRef.current) clearTimeout(personalSyncTimerRef.current);
    personalSyncTimerRef.current = setTimeout(() => {
      const snap: PartyHuntSnapshotV1 = {
        version: PARTY_HUNT_SNAPSHOT_VERSION,
        mapKey,
        channel,
        miniMode,
        partyRoomId,
        lastJoinCode: party?.joinCode ?? savedClosedParty?.joinCode ?? null,
        party,
        pins,
        savedClosedParty,
        updatedAtIso: new Date().toISOString(),
      };
      void putPartyHuntField({ viewerId, partyHunt: snap }).then((result) => {
        setConnectionStatus(result.ok ? 'online' : 'error');
      });
    }, 600);
    return () => {
      if (personalSyncTimerRef.current) clearTimeout(personalSyncTimerRef.current);
    };
  }, [
    channel,
    loaded,
    mapKey,
    miniMode,
    onlineEnabled,
    party,
    partyRoomId,
    pins,
    savedClosedParty,
    viewerId,
  ]);


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
      JSON.stringify({ party, pins, savedClosedParty } satisfies LocalPartyState),
    );
  }, [loaded, party, pins, savedClosedParty]);

  useEffect(() => {
    try {
      setMiniMode(window.localStorage.getItem(MINI_MODE_STORAGE_KEY) === '1');
    } catch {
      /* default false */
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(MINI_MODE_STORAGE_KEY, miniMode ? '1' : '0');
    } catch {
      /* ignore quota */
    }
  }, [loaded, miniMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const visiblePins = useMemo(
    () => activeScoutPins(pins, party, mapKey, channel, now),
    [channel, mapKey, now, party, pins],
  );
  const sidebarPins = useMemo(
    () => partyActiveScoutPins(pins, party, now),
    [now, party, pins],
  );
  const currentMapImage = huntMapImagePath(mapKey);
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(mapKey);
  const selectedPin =
    sidebarPins.find((pin) => pin.id === selectedPinId) ??
    visiblePins.find((pin) => pin.id === selectedPinId) ??
    null;
  const viewingSharedPartyMap =
    party !== null && party.mapKey === mapKey && party.activeChannel === channel;
  const activePinLabel =
    pinCustomLabel.trim() ||
    SCOUT_PIN_KIND_PRESETS.find((item) => item.kind === pinKind)?.label ||
    'Metin';

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
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { mapKey, activeChannel: channel },
      })
        .then((room) => {
          applyPartyRoom(room);
          setNotice(`Wspólna mapa party ustawiona na ${mapKey} · CH${channel}.`);
        })
        .catch((e) => setNotice(`Sync mapy online nieudany: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }
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
    const actorId = viewerId ?? 'mateusz';
    const actorName = displayName || initialSnapshot.viewerName;
    if (onlineEnabled && viewerId) {
      setConnectionStatus('connecting');
      void createPartyRoom({
        viewerId,
        displayName: actorName,
        mapKey,
        activeChannel: channel,
        visibility,
      })
        .then((room) => {
          applyPartyRoom(room);
          setPins([]);
          setSelectedPinId(null);
          setConnectionStatus('online');
          setNotice(
            `${visibility === 'open' ? 'Otwarte' : 'Zamknięte'} party · ${room.mapKey} · kod ${room.joinCode} · wspólny pokój`,
          );
        })
        .catch((e) => {
          setConnectionStatus('error');
          setNotice(`Nie udało się utworzyć party online: ${e instanceof Error ? e.message : String(e)}`);
        });
      return;
    }
    const next = createMapParty({
      leader: { id: actorId, displayName: actorName },
      mapKey,
      activeChannel: channel,
      visibility,
      now: Date.now(),
    });
    setParty(next);
    setPartyRoomId(null);
    setPins([]);
    setSelectedPinId(null);
    setSavedClosedParty(visibility === 'closed' ? next : null);
    setNotice(
      `${visibility === 'open' ? 'Otwarte' : 'Zamknięte'} party · ${next.mapKey} · kod ${next.joinCode} (lokalnie)`,
    );
  };
  const joinWithCode = () => {
    const actorId = viewerId ?? 'mateusz';
    const actorName = displayName || initialSnapshot.viewerName;
    const code = joinCodeInput.trim();
    if (!code) {
      setNotice('Podaj kod party.');
      return;
    }
    if (onlineEnabled && viewerId) {
      setConnectionStatus('connecting');
      void joinPartyRoom({ viewerId, displayName: actorName, joinCode: code })
        .then((room) => {
          applyPartyRoom(room);
          setMapKey(room.mapKey);
          setChannel(room.activeChannel);
          setSelectedPinId(null);
          setJoinCodeInput('');
          setConnectionStatus('online');
          setNotice(`Dołączono do wspólnego party · kod ${room.joinCode}.`);
        })
        .catch((e) => {
          setConnectionStatus('error');
          setNotice(`Nie udało się dołączyć: ${e instanceof Error ? e.message : String(e)}`);
        });
      return;
    }
    const result = joinPartyByCode({
      code,
      savedClosedParty,
      member: { id: actorId, displayName: actorName },
      mapKey,
      activeChannel: channel,
      now: Date.now(),
    });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setParty(result.party);
    setPartyRoomId(null);
    setMapKey(result.party.mapKey);
    setChannel(result.party.activeChannel);
    setSelectedPinId(null);
    setJoinCodeInput('');
    if (result.party.visibility === 'closed') {
      setSavedClosedParty(result.party);
    }
    setNotice(
      result.fromSaved
        ? `Dołączono do zapisanego party · kod ${result.party.joinCode}.`
        : `Dołączono lokalnie · kod ${result.party.joinCode}.`,
    );
  };
  const leaveParty = () => {
    const leaving = party;
    if (leaving?.visibility === 'closed') {
      setSavedClosedParty(leaving);
    }
    if (onlineEnabled && viewerId && partyRoomId) {
      void leavePartyRoom({ viewerId, roomId: partyRoomId }).catch(() => undefined);
    }
    setParty(null);
    setPartyRoomId(null);
    setPartyRevision(null);
    setSelectedPinId(null);
    setNotice(
      leaving?.visibility === 'closed'
        ? `Opuszczono party. Wpisz kod ${leaving.joinCode}, żeby wrócić.`
        : 'Opuszczono party.',
    );
  };
  const copyJoinCode = async () => {
    if (!party?.joinCode) return;
    try {
      await navigator.clipboard.writeText(party.joinCode);
      setNotice(`Skopiowano kod party: ${party.joinCode}`);
    } catch {
      setNotice(`Kod party: ${party.joinCode} (kopiowanie niedostępne — skopiuj ręcznie).`);
    }
  };
  const resetSession = () => {
    if (!party) return;
    const ok = window.confirm('Wyzerować zbicia sesji do 0?');
    if (!ok) {
      setNotice('Reset sesji anulowany.');
      return;
    }
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { sessionKills: 0 },
      })
        .then((room) => {
          applyPartyRoom(room);
          setNotice('Sesja wyzerowana · zbicia = 0 (wspólny pokój).');
        })
        .catch((e) => setNotice(`Reset online nieudany: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }
    const next = resetSessionKills(party);
    setParty(next);
    if (next.visibility === 'closed') setSavedClosedParty(next);
    setNotice('Sesja wyzerowana · zbicia = 0.');
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
      placedBy: displayName || initialSnapshot.viewerName,
      label: activePinLabel.slice(0, 24),
      kind: pinKind,
    };
    setPins((current) => placeScoutPin(current, pin));
    setSelectedPinId(pin.id);
    setNotice(`Pinezka ${pin.label} · ~10 min · widoczna dla party na tej mapie/CH.`);
    if (onlineEnabled && viewerId && partyRoomId) {
      void addPartyRoomPin({ viewerId, roomId: partyRoomId, pin }).then(applyPartyRoom).catch(() => {
        setConnectionStatus('error');
      });
    }
  };
  const selectPinFromList = (pin: PartyScoutPin) => {
    setMapKey(pin.mapKey);
    setChannel(pin.channel);
    setSelectedPinId(pin.id);
    const remaining = formatScoutPinRemaining(scoutPinRemainingMs(pin, Date.now()));
    setNotice(`Wybrano: ${pin.label} · TTL ${remaining}`);
  };
  const dismissPin = (pinId: string) => {
    setPins((current) => dismissScoutPin(current, pinId));
    setSelectedPinId((current) => (current === pinId ? null : current));
    setNotice('Pinezka odkliknięta.');
    if (onlineEnabled && viewerId && partyRoomId) {
      void removePartyRoomPin({ viewerId, roomId: partyRoomId, pinId }).then(applyPartyRoom).catch(() => {
        setConnectionStatus('error');
      });
    }
  };
  const killAndDismiss = (pinId: string) => {
    if (!party) return;
    const nextKills = party.sessionKills + 1;
    const next = incrementSessionKills(party);
    setParty(next);
    if (next.visibility === 'closed') setSavedClosedParty(next);
    setPins((current) => dismissScoutPin(current, pinId));
    setSelectedPinId(null);
    setNotice('Zbicie w sesji (+1). Pinezka zdjęta.');
    if (onlineEnabled && viewerId && partyRoomId) {
      const rev = partyRevision;
      void removePartyRoomPin({ viewerId, roomId: partyRoomId, pinId })
        .then(async (room) => {
          if (rev === null) return applyPartyRoom(room);
          try {
            return applyPartyRoom(
              await patchPartyRoom({
                viewerId,
                roomId: partyRoomId,
                expectedRevision: room.revision,
                patch: { sessionKills: nextKills },
              }),
            );
          } catch {
            return applyPartyRoom(room);
          }
        })
        .catch(() => setConnectionStatus('error'));
    }
  };
  const markSessionKill = () => {
    if (!party) return;
    const nextKills = party.sessionKills + 1;
    const next = incrementSessionKills(party);
    setParty(next);
    if (next.visibility === 'closed') setSavedClosedParty(next);
    setNotice('Zbicie w sesji (+1).');
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { sessionKills: nextKills },
      })
        .then(applyPartyRoom)
        .catch(() => setConnectionStatus('error'));
    }
  };

  return (
    <AppShell activeSection="maps" viewerName={displayName || initialSnapshot.viewerName}>
      <main className={`respawn-page ${styles.root}${miniMode ? ' is-mini' : ''}`} id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Party</h1>
            {!miniMode ? (
              <p>
                Drużyna + pinezka skauta (~10 min). Twój wybór mapy poniżej to <b>Twój widok</b> —
                wspólna mapa party zmienia się dopiero przyciskiem w panelu drużyny.
              </p>
            ) : (
              <p className="respawn-mini-lead">
                {mapKey} · CH{channel} · mini okno · {huntStatusLabel(connectionStatus)}
              </p>
            )}
          </div>
          <div className="respawn-header-actions">
            <span
              className={`respawn-sync-status is-${connectionStatus}`}
              data-testid="party-sync-status"
              title={viewerId ? `viewer ${viewerId}` : 'Brak demo viewer id — tylko lokalnie'}
            >
              {huntStatusLabel(connectionStatus)}
            </span>
            <button
              aria-pressed={miniMode}
              className={miniMode ? 'is-active' : ''}
              data-testid="party-mini-mode-btn"
              onClick={() => setMiniMode((current) => !current)}
              title={miniMode ? 'Widok pełny' : 'Mini okno'}
              type="button"
            >
              {miniMode ? 'Widok pełny' : 'Mini okno'}
            </button>
            {party && !miniMode ? (
              <>
                {party.visibility === 'closed' || party.joinCode ? (
                  <button className="respawn-party-toggle" onClick={copyJoinCode} type="button">
                    <span /> Kopiuj kod
                  </button>
                ) : null}
                <button className="respawn-party-toggle" onClick={resetSession} type="button">
                  <span /> Reset sesji
                </button>
              </>
            ) : null}
            {party && miniMode ? (
              <button className="respawn-party-toggle" onClick={copyJoinCode} type="button">
                <span /> Kod
              </button>
            ) : null}
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
              {(partyMaps.length > 0 ? partyMaps : respawnMaps).map((candidate) => (
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
                {!miniMode ? (
                  <p className="respawn-list-lead">
                    Wybierz rodzaj pinezki, potem klik mapy (~10 min TTL). Lista aktywnych pinezek
                    jest obok.
                  </p>
                ) : null}
              </div>
              {party ? (
                <div className="respawn-filters">
                  <button onClick={markSessionKill} type="button">
                    Zbite w sesji (+1)
                  </button>
                </div>
              ) : null}
            </header>

            {party ? (
              <div className={styles.pinKindBar}>
                <span className={styles.pinKindLabel}>Rodzaj pinezki</span>
                <div className={styles.pinKindChoices}>
                  {SCOUT_PIN_KIND_PRESETS.map((preset) => (
                    <button
                      aria-pressed={pinKind === preset.kind && !pinCustomLabel.trim()}
                      className={
                        pinKind === preset.kind && !pinCustomLabel.trim() ? 'is-active' : ''
                      }
                      key={preset.kind}
                      onClick={() => {
                        setPinKind(preset.kind);
                        setPinCustomLabel('');
                      }}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className={`catalog-search ${styles.pinKindCustom}`}>
                  <span className="sr-only">Własna etykieta</span>
                  <input
                    maxLength={24}
                    onChange={(event) => {
                      setPinCustomLabel(event.target.value);
                      if (event.target.value.trim()) setPinKind('spot');
                    }}
                    placeholder="Własna etykieta (opcjonalnie)"
                    value={pinCustomLabel}
                  />
                </label>
                <span className={styles.pinKindHint}>Następna: {activePinLabel}</span>
              </div>
            ) : null}

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
                  const remaining = formatScoutPinRemaining(scoutPinRemainingMs(pin, now));
                  return (
                    <button
                      aria-label={`Pinezka ${pin.label} · ${formatAge(age)} · TTL ${remaining}`}
                      className={`respawn-map-marker respawn-map-pin is-scout ${pinMarkerClass(
                        pin.kind,
                      )}${selectedPinId === pin.id ? ' is-selected' : ''}`}
                      key={pin.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPinId(pin.id);
                        setNotice(`Pinezka ${pin.label}: ${formatAge(age)} · TTL ${remaining}`);
                      }}
                      style={{ left: `${pin.location.x}%`, top: `${pin.location.y}%` }}
                      title={`${pin.label} · ${formatAge(age)} · ${pin.placedBy}`}
                      type="button"
                    >
                      <MapPinGlyph />
                    </button>
                  );
                })}
              </div>
              {!miniMode ? (
                <p className="respawn-map-help">
                  {!party
                    ? 'Najpierw utwórz party albo dołącz kodem obok — potem klik mapy stawia pinezkę.'
                    : 'Klik mapy = pinezka. Klik pinezki = odklik / zbicie w sesji.'}
                </p>
              ) : null}
              {selectedPin ? (
                <div className="respawn-party-feed">
                  <span>Wybrana pinezka · TTL na żywo</span>
                  <p>
                    <b>{selectedPin.label}</b> ({scoutPinKindLabel(selectedPin.kind)}) ·{' '}
                    {selectedPin.mapKey} CH{selectedPin.channel} · {selectedPin.location.x}% /{' '}
                    {selectedPin.location.y}%
                  </p>
                  <p>
                    {formatAge(scoutPinAgeMinutes(selectedPin, now))} · {selectedPin.placedBy} ·{' '}
                    <b>TTL {formatScoutPinRemaining(scoutPinRemainingMs(selectedPin, now))}</b>
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
                  <h2>Utwórz lub dołącz</h2>
                  {!miniMode ? (
                    <p>Wybierz swój widok mapy, stwórz otwarte/zamknięte party albo wpisz kod.</p>
                  ) : (
                    <p className="respawn-mini-lead">{huntStatusLabel(connectionStatus)}</p>
                  )}
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
                <div className="respawn-party-feed">
                  <span>Dołącz kodem</span>
                  <label className="catalog-search">
                    <span className="sr-only">Kod party</span>
                    <input
                      inputMode="numeric"
                      onChange={(event) => setJoinCodeInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') joinWithCode();
                      }}
                      placeholder="Kod party"
                      value={joinCodeInput}
                    />
                  </label>
                  <button
                    className="respawn-party-toggle is-on"
                    disabled={!joinCodeInput.trim()}
                    onClick={joinWithCode}
                    type="button"
                  >
                    <span /> Dołącz
                  </button>
                  {savedClosedParty ? (
                    <p>
                      Zapisane zamknięte party czeka na kod <b>{savedClosedParty.joinCode}</b>.
                    </p>
                  ) : !miniMode ? (
                    <p>{onlineEnabled && viewerId ? 'Dołącz kodem do wspólnego pokoju player-team.' : 'Offline: lokalny join-by-code (cache).'}</p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <header>
                  <span className="section-kicker">Drużyna</span>
                  <h2>{party.name}</h2>
                  <p>
                    Kod <b>{party.joinCode}</b> ·{' '}
                    {party.visibility === 'open' ? 'otwarte' : 'zamknięte'} · zbicia:{' '}
                    <b>{party.sessionKills}</b>
                  </p>
                  {!miniMode ? (
                    <p className="respawn-list-lead">
                      Wspólna mapa party: <b>{party.mapKey}</b> · CH{party.activeChannel}
                    </p>
                  ) : (
                    <p className="respawn-mini-lead">
                      {party.mapKey} · CH{party.activeChannel}
                    </p>
                  )}
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
                  onClick={() => {
                    const next = togglePartyVisibility(party);
                    setParty(next);
                    setSavedClosedParty(next.visibility === 'closed' ? next : null);
                  }}
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
                <div className={`respawn-party-feed ${styles.pinList}`}>
                  <span>Aktywne pinezki ({sidebarPins.length})</span>
                  {sidebarPins.length === 0 ? (
                    <p>Brak aktywnych pinezek — kliknij mapę, żeby postawić.</p>
                  ) : (
                    <ul className={styles.pinListItems}>
                      {sidebarPins.map((pin) => {
                        const remaining = formatScoutPinRemaining(scoutPinRemainingMs(pin, now));
                        return (
                          <li
                            className={`${styles.pinListItem}${
                              selectedPinId === pin.id ? ` ${styles.pinListItemSelected}` : ''
                            }`}
                            key={pin.id}
                          >
                            <button
                              className={styles.pinListSelect}
                              onClick={() => selectPinFromList(pin)}
                              type="button"
                            >
                              <strong>{pin.label}</strong>
                              <small>
                                {pin.mapKey} CH{pin.channel} · {pin.location.x}% /{' '}
                                {pin.location.y}%
                              </small>
                              <b className={styles.pinListTtl}>TTL {remaining}</b>
                            </button>
                            <button
                              aria-label={`Odkliknij ${pin.label}`}
                              className={styles.pinListDismiss}
                              onClick={() => dismissPin(pin.id)}
                              type="button"
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {!miniMode ? (
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
                ) : null}
                <button className="respawn-party-toggle" onClick={leaveParty} type="button">
                  <span /> Opuść party
                </button>
              </>
            )}
          </aside>
        </section>

        <p aria-live="polite" className="respawn-notice">
          {notice}
        </p>
        {!miniMode ? (
          <p className="respawn-data-note">
            Twój widok mapy nie nadpisuje automatycznie wspólnej mapy party. Pinezki skauta znikają
            po ~10 min.{' '}
            {connectionStatus === 'online'
              ? 'Wspólny pokój party przez player-team (poll). localStorage = cache offline.'
              : 'Tryb lokalny / offline — localStorage jako cache.'}
          </p>
        ) : null}
      </main>
    </AppShell>
  );
}
