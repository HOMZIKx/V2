'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';

import { huntMapImagePath } from '../../src/hunt-map-assets';
import { huntStatusLabel, useHuntViewer, type HuntConnectionStatus } from '../../src/hunt-online';
import { PARTY_HUNT_SNAPSHOT_VERSION, type PartyHuntSnapshotV1 } from '../../src/hunt-snapshot';
import type { MapHuntingSnapshot } from '../../src/map-hunting';
import {
  PARTY_SCOUT_PIN_TTL_MS,
  SCOUT_PIN_KIND_PRESETS,
  activeScoutPins,
  claimScoutPin,
  completeScoutPin,
  createMapParty,
  dismissScoutPin,
  formatScoutPinRemaining,
  incrementSessionKills,
  joinPartyByCode,
  partyActiveScoutPins,
  partyCompletedScoutPins,
  placeScoutPin,
  pruneExpiredScoutPins,
  releaseScoutPinClaim,
  requestPartyJoin,
  resetSessionKills,
  resolvePartyRequest,
  scoutPinAgeMinutes,
  scoutPinKindLabel,
  scoutPinRemainingMs,
  setPartyChannel,
  setPartyMap,
  setPartyMemberHuntRole,
  togglePartyVisibility,
  type MapParty,
  type PartyHuntRole,
  type PartyScoutPin,
  type PartyVisibility,
  type ScoutPinKind,
} from '../../src/map-party';
import { loadHuntFieldsFromServer, putPartyHuntField } from '../../src/player-team-field-sync';
import {
  addPartyRoomPin,
  createPartyRoom,
  getPartyRoom,
  joinPartyRoom,
  leavePartyRoom,
  patchPartyRoom,
  patchPartyRoomPin,
  removePartyRoomPin,
  setPartyRoomHuntRole,
  type PartyRoomSnapshot,
} from '../../src/player-team-rooms-api';
import { respawnMaps, type RespawnLocation } from '../../src/respawn-timers';
import { AppShell } from '../app-shell';
import styles from './map-hunting.module.css';

/** Party map list: catalog entries that still have atlas images. */
const partyMaps = respawnMaps.filter((candidate) => huntMapImagePath(candidate.key) !== null);

const CHANNEL_COLORS: readonly string[] = [
  '#ef5b5b',
  '#4f8df7',
  '#45bd7d',
  '#8b6cf0',
  '#ed9948',
  '#34b8c8',
  '#d8b63f',
  '#d85eaa',
];

interface LocalPartyState {
  readonly party: MapParty | null;
  readonly pins: readonly PartyScoutPin[];
  /** Last closed party kept for local join-by-code after leave. */
  readonly savedClosedParty: MapParty | null;
}

const STORAGE_KEY = 'destiled:map-party:v2';
const MINI_MODE_STORAGE_KEY = 'destiled:party-mini-mode:v1';

function channelColor(channel: number): string {
  return CHANNEL_COLORS[(Math.max(1, channel) - 1) % CHANNEL_COLORS.length] ?? '#4f8df7';
}

function channelButtonStyle(channel: number, active: boolean): CSSProperties {
  const color = channelColor(channel);
  return {
    borderColor: color,
    background: active ? `${color}35` : `${color}12`,
    boxShadow: active ? `0 0 0 2px ${color}30, 0 8px 22px ${color}20` : undefined,
    color: active ? '#fff' : color,
  };
}

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
        stroke="rgba(255,255,255,0.8)"
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

function normalizeLocalParty(value: MapParty, fallbackMapKey: string, validMaps: Set<string>): MapParty {
  const rawMembers = Array.isArray(value.members) ? value.members : [];
  const members = rawMembers.map((member) => ({
    ...member,
    huntRole:
      member.huntRole === 'scout' || member.huntRole === 'hunter'
        ? member.huntRole
        : member.role === 'leader'
          ? ('scout' as const)
          : ('hunter' as const),
  }));
  const nextMapKey = validMaps.has(value.mapKey) ? value.mapKey : fallbackMapKey;
  return {
    ...value,
    id: typeof value.id === 'string' ? value.id : `party-migrated-${Date.now()}`,
    name: typeof value.name === 'string' ? value.name : `Party · ${nextMapKey}`,
    leaderId:
      typeof value.leaderId === 'string'
        ? value.leaderId
        : (members[0]?.id ?? 'unknown'),
    visibility: value.visibility === 'closed' ? 'closed' : 'open',
    joinCode: typeof value.joinCode === 'string' ? value.joinCode : '',
    mapKey: nextMapKey,
    activeChannel:
      typeof value.activeChannel === 'number' && value.activeChannel >= 1 ? value.activeChannel : 1,
    members,
    requests: Array.isArray(value.requests) ? value.requests : [],
    sessionKills: typeof value.sessionKills === 'number' ? value.sessionKills : 0,
  };
}

export function PartyHunt({ initialSnapshot }: { readonly initialSnapshot: MapHuntingSnapshot }) {
  const [mapKey, setMapKey] = useState((partyMaps[0] ?? respawnMaps[0])?.key ?? '');
  const map = respawnMaps.find((candidate) => candidate.key === mapKey) ?? respawnMaps[0];
  const [channel, setChannel] = useState(1);
  const [allChannels, setAllChannels] = useState(false);
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
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failedMapImages, setFailedMapImages] = useState<readonly string[]>([]);
  const [miniMode, setMiniMode] = useState(false);
  const { viewerId, displayName, onlineEnabled, hydrated: storeHydrated } = useHuntViewer();
  const [connectionStatus, setConnectionStatus] = useState<HuntConnectionStatus>('offline');
  const [partyRoomId, setPartyRoomId] = useState<string | null>(null);
  const [partyRevision, setPartyRevision] = useState<number | null>(null);
  const personalSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemoteRef = useRef(false);

  const actorId = viewerId ?? 'mateusz';
  const actorName = displayName || initialSnapshot.viewerName;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as LocalPartyState;
        const catalogKeys = new Set(
          (partyMaps.length > 0 ? partyMaps : respawnMaps).map((candidate) => candidate.key),
        );
        const fallbackKey = (partyMaps[0] ?? respawnMaps[0])?.key ?? '';
        const migrated = saved.party
          ? normalizeLocalParty(saved.party, fallbackKey, catalogKeys)
          : null;
        const closedSaved = saved.savedClosedParty
          ? normalizeLocalParty(saved.savedClosedParty, fallbackKey, catalogKeys)
          : migrated?.visibility === 'closed'
            ? migrated
            : null;
        setParty(migrated);
        setSavedClosedParty(closedSaved);
        if (migrated) {
          setMapKey(migrated.mapKey);
          setChannel(migrated.activeChannel);
        }
        if (Array.isArray(saved.pins)) {
          const validPins = saved.pins.filter((pinUnknown): pinUnknown is PartyScoutPin => {
            if (!pinUnknown || typeof pinUnknown !== 'object') return false;
            const pin = pinUnknown as Partial<PartyScoutPin> & {
              location?: { x?: number; y?: number };
            };
            return (
              typeof pin.id === 'string' &&
              typeof pin.partyId === 'string' &&
              typeof pin.mapKey === 'string' &&
              typeof pin.channel === 'number' &&
              typeof pin.placedAt === 'number' &&
              !!pin.location &&
              typeof pin.location.x === 'number' &&
              typeof pin.location.y === 'number'
            );
          });
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
    const nextParty: MapParty = {
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
    };
    setParty(nextParty);
    setPins(room.pins);
    setSavedClosedParty(room.visibility === 'closed' ? nextParty : null);
    setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 0);
  }, []);

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
        if (!cancelled) setConnectionStatus((current) => (current === 'online' ? 'error' : current));
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyPartyRoom, loaded, onlineEnabled, partyRoomId, viewerId]);

  useEffect(() => {
    if (!loaded || applyingRemoteRef.current || !onlineEnabled || !viewerId) return;
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
    () =>
      allChannels
        ? partyActiveScoutPins(pins, party, now).filter((pin) => pin.mapKey === mapKey)
        : activeScoutPins(pins, party, mapKey, channel, now),
    [allChannels, channel, mapKey, now, party, pins],
  );
  const sidebarPins = useMemo(() => partyActiveScoutPins(pins, party, now), [now, party, pins]);
  const completedPins = useMemo(
    () =>
      [...partyCompletedScoutPins(pins, party)]
        .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
        .slice(0, 8),
    [party, pins],
  );
  const channelViewLabel = allChannels ? 'Podgląd wszystkich CH' : `CH${channel}`;
  const currentMapImage = huntMapImagePath(mapKey);
  const canShowMapImage = currentMapImage !== null && !failedMapImages.includes(mapKey);
  const selectedPin =
    sidebarPins.find((pin) => pin.id === selectedPinId) ??
    visiblePins.find((pin) => pin.id === selectedPinId) ??
    null;
  const hoveredPin = visiblePins.find((pin) => pin.id === hoveredPinId) ?? null;
  const tooltipPin = hoveredPin ?? selectedPin;
  const viewingSharedPartyMap =
    !allChannels && party !== null && party.mapKey === mapKey && party.activeChannel === channel;
  const activePinLabel =
    pinCustomLabel.trim() ||
    SCOUT_PIN_KIND_PRESETS.find((item) => item.kind === pinKind)?.label ||
    'Metin';
  const currentMember = party?.members.find((member) => member.id === actorId) ?? null;
  const currentHuntRole: PartyHuntRole = currentMember?.huntRole ?? 'hunter';

  const economyHref = useMemo(() => {
    const params = new URLSearchParams({
      scope: 'team',
      source: party?.name ?? `Party · ${mapKey}`,
      map: mapKey,
      channel: String(channel),
    });
    if (party?.id) params.set('sessionId', party.id);
    if (party?.members.length) {
      params.set('participants', party.members.map((member) => member.displayName).join(','));
    }
    return `/economy?${params.toString()}`;
  }, [channel, mapKey, party]);

  const changeMap = (next: string) => {
    setMapKey(next);
    setChannel(1);
    setAllChannels(false);
    setSelectedPinId(null);
  };
  const changeChannel = (next: number) => {
    setAllChannels(false);
    setChannel(next);
    setSelectedPinId(null);
  };
  const showAllChannels = () => {
    setAllChannels(true);
    setSelectedPinId(null);
  };

  const syncPartyToMyView = () => {
    if (!party) return;
    if (allChannels) {
      setNotice('Wybierz konkretny CH, aby ustawić wspólną mapę party.');
      return;
    }
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { mapKey, activeChannel: channel },
      })
        .then((room) => {
          applyPartyRoom(room);
          setNotice(`Wspólna mapa party: ${mapKey} · CH${channel}.`);
        })
        .catch((error) =>
          setNotice(`Sync mapy nieudany: ${error instanceof Error ? error.message : String(error)}`),
        );
      return;
    }
    setParty(setPartyChannel(setPartyMap(party, mapKey, channel), channel));
    setNotice(`Wspólna mapa party: ${mapKey} · CH${channel}.`);
  };

  const jumpToPartyMap = () => {
    if (!party) return;
    setAllChannels(false);
    setMapKey(party.mapKey);
    setChannel(party.activeChannel);
    setSelectedPinId(null);
  };

  const createParty = (visibility: PartyVisibility) => {
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
            `${visibility === 'open' ? 'Otwarte' : 'Zamknięte'} party · ${room.mapKey} · kod ${room.joinCode}`,
          );
        })
        .catch((error) => {
          setConnectionStatus('error');
          setNotice(
            `Nie udało się utworzyć party: ${error instanceof Error ? error.message : String(error)}`,
          );
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
    setNotice(`${visibility === 'open' ? 'Otwarte' : 'Zamknięte'} party · kod ${next.joinCode}`);
  };

  const joinWithCode = () => {
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
          setAllChannels(false);
          setSelectedPinId(null);
          setJoinCodeInput('');
          setConnectionStatus('online');
          setNotice(`Dołączono do party · kod ${room.joinCode}.`);
        })
        .catch((error) => {
          setConnectionStatus('error');
          setNotice(`Nie udało się dołączyć: ${error instanceof Error ? error.message : String(error)}`);
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
    setAllChannels(false);
    setSelectedPinId(null);
    setJoinCodeInput('');
    if (result.party.visibility === 'closed') setSavedClosedParty(result.party);
    setNotice(`Dołączono lokalnie · kod ${result.party.joinCode}.`);
  };

  const leaveParty = () => {
    const leaving = party;
    if (leaving?.visibility === 'closed') setSavedClosedParty(leaving);
    if (onlineEnabled && viewerId && partyRoomId) {
      void leavePartyRoom({ viewerId, roomId: partyRoomId }).catch(() => undefined);
    }
    setParty(null);
    setPartyRoomId(null);
    setPartyRevision(null);
    setSelectedPinId(null);
    setHoveredPinId(null);
    setNotice('Opuszczono party.');
  };

  const copyJoinCode = async () => {
    if (!party?.joinCode) return;
    try {
      await navigator.clipboard.writeText(party.joinCode);
      setNotice(`Skopiowano kod party: ${party.joinCode}`);
    } catch {
      setNotice(`Kod party: ${party.joinCode}`);
    }
  };

  const resetSession = () => {
    if (!party || !window.confirm('Wyzerować zbicia sesji do 0?')) return;
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { sessionKills: 0 },
      })
        .then((room) => {
          applyPartyRoom(room);
          setNotice('Licznik sesji wyzerowany.');
        })
        .catch((error) =>
          setNotice(`Reset nieudany: ${error instanceof Error ? error.message : String(error)}`),
        );
      return;
    }
    const next = resetSessionKills(party);
    setParty(next);
    if (next.visibility === 'closed') setSavedClosedParty(next);
    setNotice('Licznik sesji wyzerowany.');
  };

  const addRequest = () => {
    const name = requestName.trim();
    if (!party || !name) return;
    const next = requestPartyJoin(party, {
      id: `guest-${name.toLocaleLowerCase('pl').replace(/\s+/g, '-')}`,
      displayName: name,
    });
    setRequestName('');
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { requests: next.requests },
      })
        .then(applyPartyRoom)
        .catch((error) =>
          setNotice(`Nie udało się dodać prośby: ${error instanceof Error ? error.message : String(error)}`),
        );
      return;
    }
    setParty(next);
  };

  const resolveJoinRequest = (requestId: string, accepted: boolean) => {
    if (!party) return;
    const next = resolvePartyRequest(party, requestId, accepted);
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { requests: next.requests },
      })
        .then(applyPartyRoom)
        .catch((error) =>
          setNotice(`Nie udało się zapisać decyzji: ${error instanceof Error ? error.message : String(error)}`),
        );
      return;
    }
    setParty(next);
  };

  const setHuntRole = (huntRole: PartyHuntRole) => {
    if (!party || currentHuntRole === huntRole) return;
    if (onlineEnabled && viewerId && partyRoomId) {
      void setPartyRoomHuntRole({ viewerId, roomId: partyRoomId, huntRole })
        .then((room) => {
          applyPartyRoom(room);
          setNotice(huntRole === 'scout' ? 'Rola: Scout.' : 'Rola: Bijący.');
        })
        .catch((error) =>
          setNotice(`Zmiana roli nieudana: ${error instanceof Error ? error.message : String(error)}`),
        );
      return;
    }
    const next = setPartyMemberHuntRole(party, actorId, huntRole);
    setParty(next);
    if (next.visibility === 'closed') setSavedClosedParty(next);
    setNotice(huntRole === 'scout' ? 'Rola: Scout.' : 'Rola: Bijący.');
  };

  const placeOnMap = (event: MouseEvent<HTMLDivElement>) => {
    if (!party) return;
    if (allChannels) {
      setNotice('Wybierz konkretny CH, aby postawić pinezkę.');
      return;
    }
    if (currentHuntRole !== 'scout') {
      setNotice('Pinezki stawia Scout. Zmień rolę na Scout, jeśli przejmujesz skautowanie.');
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const location: RespawnLocation = {
      x: Math.max(0, Math.min(100, Math.round(((event.clientX - bounds.left) / bounds.width) * 1_000) / 10)),
      y: Math.max(0, Math.min(100, Math.round(((event.clientY - bounds.top) / bounds.height) * 1_000) / 10)),
    };
    const pin: PartyScoutPin = {
      id: `pin-${Date.now()}`,
      partyId: party.id,
      mapKey,
      channel,
      location,
      placedAt: Date.now(),
      placedBy: actorName,
      label: activePinLabel.slice(0, 24),
      kind: pinKind,
      claimedBy: null,
      claimedAt: null,
      completedBy: null,
      completedAt: null,
    };
    setPins((current) => placeScoutPin(current, pin));
    setSelectedPinId(pin.id);
    setNotice(`Pinezka ${pin.label} · CH${channel} · aktywna ~10 min.`);
    if (onlineEnabled && viewerId && partyRoomId) {
      void addPartyRoomPin({ viewerId, roomId: partyRoomId, pin })
        .then(applyPartyRoom)
        .catch(() => setConnectionStatus('error'));
    }
  };

  const selectPinFromList = (pin: PartyScoutPin) => {
    setAllChannels(false);
    setMapKey(pin.mapKey);
    setChannel(pin.channel);
    setSelectedPinId(pin.id);
    setNotice(`Wybrano ${pin.label} · ${formatAge(scoutPinAgeMinutes(pin, Date.now()))}.`);
  };

  const dismissPin = (pinId: string) => {
    setPins((current) => dismissScoutPin(current, pinId));
    setSelectedPinId((current) => (current === pinId ? null : current));
    setHoveredPinId((current) => (current === pinId ? null : current));
    setNotice('Pinezka usunięta bez zaliczenia zbicia.');
    if (onlineEnabled && viewerId && partyRoomId) {
      void removePartyRoomPin({ viewerId, roomId: partyRoomId, pinId })
        .then(applyPartyRoom)
        .catch(() => setConnectionStatus('error'));
    }
  };

  const toggleGoing = (pin: PartyScoutPin) => {
    if (!party) return;
    if (currentHuntRole !== 'hunter') {
      setNotice('„Idę” jest akcją Bijącego. Zmień rolę na Bijący.');
      return;
    }
    if (pin.claimedBy && pin.claimedBy !== actorName) {
      setNotice(`${pin.claimedBy} już idzie do tej pinezki.`);
      return;
    }
    const release = pin.claimedBy === actorName;
    const claimTime = Date.now();
    setPins((current) =>
      release
        ? releaseScoutPinClaim(current, pin.id, actorName)
        : claimScoutPin(current, pin.id, actorName, claimTime),
    );
    setNotice(release ? 'Anulowano „Idę”.' : `Idę · ${pin.label} · CH${pin.channel}.`);
    if (onlineEnabled && viewerId && partyRoomId) {
      void patchPartyRoomPin({
        viewerId,
        roomId: partyRoomId,
        pinId: pin.id,
        patch: release
          ? { claimedBy: null, claimedAt: null }
          : { claimedBy: actorName, claimedAt: claimTime },
      })
        .then(applyPartyRoom)
        .catch(() => setConnectionStatus('error'));
    }
  };

  const killAndComplete = (pin: PartyScoutPin) => {
    if (!party) return;
    if (currentHuntRole !== 'hunter') {
      setNotice('Zbicie oznacza Bijący. Zmień rolę na Bijący.');
      return;
    }
    const completedAt = Date.now();
    const nextParty = incrementSessionKills(party);
    setParty(nextParty);
    if (nextParty.visibility === 'closed') setSavedClosedParty(nextParty);
    setPins((current) => completeScoutPin(current, pin.id, actorName, completedAt));
    setSelectedPinId(null);
    setHoveredPinId(null);
    setNotice(`Zbite · ${pin.label} · CH${pin.channel}. Sesja +1.`);

    if (onlineEnabled && viewerId && partyRoomId) {
      void patchPartyRoomPin({
        viewerId,
        roomId: partyRoomId,
        pinId: pin.id,
        patch: { completedBy: actorName, completedAt },
      })
        .then((room) =>
          patchPartyRoom({
            viewerId,
            roomId: partyRoomId,
            expectedRevision: room.revision,
            patch: { sessionKillsDelta: 1 },
          }),
        )
        .then(applyPartyRoom)
        .catch(() => setConnectionStatus('error'));
    }
  };

  const toggleVisibility = () => {
    if (!party) return;
    const next = togglePartyVisibility(party);
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { visibility: next.visibility },
      })
        .then(applyPartyRoom)
        .catch((error) =>
          setNotice(`Zmiana widoczności nieudana: ${error instanceof Error ? error.message : String(error)}`),
        );
      return;
    }
    setParty(next);
    setSavedClosedParty(next.visibility === 'closed' ? next : null);
  };

  const markSessionKill = () => {
    if (!party) return;
    const next = incrementSessionKills(party);
    setParty(next);
    if (next.visibility === 'closed') setSavedClosedParty(next);
    setNotice('Zbicie w sesji (+1).');
    if (onlineEnabled && viewerId && partyRoomId && partyRevision !== null) {
      void patchPartyRoom({
        viewerId,
        roomId: partyRoomId,
        expectedRevision: partyRevision,
        patch: { sessionKillsDelta: 1 },
      })
        .then(applyPartyRoom)
        .catch(() => setConnectionStatus('error'));
    }
  };

  return (
    <AppShell activeSection="maps" viewerName={actorName}>
      <main className={`respawn-page ${styles.root}${miniMode ? ' is-mini' : ''}`} id="main-content">
        <header className="respawn-header">
          <div>
            <span className="eyebrow">Wyprawa · Projekt Hard</span>
            <h1>Party</h1>
            {!miniMode ? (
              <p>
                Scout zaznacza, Bijący przejmuje pinezkę przez „Idę” i zamyka ją przez „Zbite”. Kolor
                pinezki zawsze odpowiada konkretnemu kanałowi.
              </p>
            ) : (
              <p className="respawn-mini-lead">
                {mapKey} · {channelViewLabel} · {huntStatusLabel(connectionStatus)}
              </p>
            )}
          </div>
          <div className="respawn-header-actions">
            <span className={`respawn-sync-status is-${connectionStatus}`} data-testid="party-sync-status">
              {huntStatusLabel(connectionStatus)}
            </span>
            <button
              aria-pressed={miniMode}
              className={miniMode ? 'is-active' : ''}
              data-testid="party-mini-mode-btn"
              onClick={() => setMiniMode((current) => !current)}
              type="button"
            >
              {miniMode ? 'Widok pełny' : 'Mini okno'}
            </button>
            {party ? (
              <>
                <button className="respawn-party-toggle" onClick={() => void copyJoinCode()} type="button">
                  <span /> Kopiuj kod
                </button>
                {!miniMode ? (
                  <button className="respawn-party-toggle" onClick={resetSession} type="button">
                    <span /> Reset sesji
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </header>

        <section className="respawn-controls panel">
          <div className="respawn-map-select">
            <label htmlFor="party-map">Mapa (Twój widok)</label>
            <select id="party-map" onChange={(event) => changeMap(event.target.value)} value={mapKey}>
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
                  aria-pressed={!allChannels && value === channel}
                  className={!allChannels && value === channel ? 'is-active' : ''}
                  key={value}
                  onClick={() => changeChannel(value)}
                  style={channelButtonStyle(value, !allChannels && value === channel)}
                  type="button"
                >
                  CH{value}
                </button>
              ))}
              <button
                aria-pressed={allChannels}
                className={allChannels ? 'is-active' : ''}
                onClick={showAllChannels}
                title="Tylko podgląd — pinezki zawsze należą do konkretnego CH"
                type="button"
              >
                Podgląd wszystkich
              </button>
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
                <span className="section-kicker">Twój widok · {mapKey} · {channelViewLabel}</span>
                <h2>Mapa party / skaut</h2>
                {party ? (
                  <p className="respawn-list-lead">
                    Wspólna mapa party: <b>{party.mapKey}</b> · CH{party.activeChannel}. Twoja rola:{' '}
                    <b>{currentHuntRole === 'scout' ? 'Scout' : 'Bijący'}</b>.
                  </p>
                ) : null}
              </div>
              {party ? (
                <div className="respawn-filters">
                  <a className="respawn-party-toggle is-on" href={economyHref}>
                    Dodaj drop z sesji
                  </a>
                  <button onClick={markSessionKill} type="button">Zbite ręcznie (+1)</button>
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
                      className={pinKind === preset.kind && !pinCustomLabel.trim() ? 'is-active' : ''}
                      disabled={currentHuntRole !== 'scout'}
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
                    disabled={currentHuntRole !== 'scout'}
                    maxLength={24}
                    onChange={(event) => {
                      setPinCustomLabel(event.target.value);
                      if (event.target.value.trim()) setPinKind('spot');
                    }}
                    placeholder={currentHuntRole === 'scout' ? 'Własna etykieta' : 'Pinezki dodaje Scout'}
                    value={pinCustomLabel}
                  />
                </label>
              </div>
            ) : null}

            <div className="respawn-map-stage-wrap">
              <div
                aria-label={party && !allChannels ? 'Mapa party — klik stawia pinezkę' : 'Mapa party'}
                className={`respawn-map-stage${party && !allChannels && currentHuntRole === 'scout' ? ' is-placing' : ''}`}
                onClick={placeOnMap}
                role={party && !allChannels && currentHuntRole === 'scout' ? 'button' : undefined}
                tabIndex={party && !allChannels && currentHuntRole === 'scout' ? 0 : undefined}
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
                      <span>{channelViewLabel}</span>
                    </div>
                  </div>
                )}
                <div className="respawn-map-shade" />
                <div className="respawn-map-caption">
                  <strong>{mapKey}</strong>
                  <span>{channelViewLabel} · TTL {Math.round(PARTY_SCOUT_PIN_TTL_MS / 60_000)} min</span>
                </div>

                {visiblePins.map((pin) => {
                  const age = scoutPinAgeMinutes(pin, now);
                  const color = channelColor(pin.channel);
                  return (
                    <button
                      aria-label={`Pinezka ${pin.label} · CH${pin.channel} · ${formatAge(age)}`}
                      className={`respawn-map-marker respawn-map-pin is-scout ${pinMarkerClass(pin.kind)}${
                        selectedPinId === pin.id ? ' is-selected' : ''
                      }`}
                      key={pin.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPinId(pin.id);
                      }}
                      onMouseEnter={() => setHoveredPinId(pin.id)}
                      onMouseLeave={() => setHoveredPinId((current) => (current === pin.id ? null : current))}
                      style={{
                        left: `${pin.location.x}%`,
                        top: `${pin.location.y}%`,
                        color,
                        filter: `drop-shadow(0 0 6px ${color})`,
                      }}
                      title={`${pin.label} · CH${pin.channel} · ${formatAge(age)} · ${pin.placedBy}`}
                      type="button"
                    >
                      <MapPinGlyph />
                      <span
                        aria-hidden
                        style={{
                          color: '#fff',
                          fontSize: 8,
                          fontWeight: 900,
                          left: '50%',
                          lineHeight: 1,
                          pointerEvents: 'none',
                          position: 'absolute',
                          textShadow: '0 1px 3px #000',
                          top: '42%',
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        {pin.channel}
                      </span>
                      {pin.claimedBy ? (
                        <span
                          style={{
                            background: `${color}e8`,
                            border: '1px solid rgba(255,255,255,.55)',
                            borderRadius: 999,
                            color: '#fff',
                            fontSize: 9,
                            fontWeight: 800,
                            left: '50%',
                            padding: '3px 7px',
                            pointerEvents: 'none',
                            position: 'absolute',
                            top: -18,
                            transform: 'translateX(-50%)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Idę · {pin.claimedBy}
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                {tooltipPin ? (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    onMouseEnter={() => setHoveredPinId(tooltipPin.id)}
                    style={{
                      background: 'rgba(9,14,18,.96)',
                      border: `1px solid ${channelColor(tooltipPin.channel)}`,
                      borderRadius: 12,
                      boxShadow: '0 14px 34px rgba(0,0,0,.45)',
                      color: '#eef2f5',
                      left: `${tooltipPin.location.x}%`,
                      maxWidth: 240,
                      minWidth: 190,
                      padding: 10,
                      position: 'absolute',
                      top: `${tooltipPin.location.y}%`,
                      transform: 'translate(-50%, calc(-100% - 24px))',
                      zIndex: 20,
                    }}
                  >
                    <strong style={{ color: channelColor(tooltipPin.channel) }}>
                      CH{tooltipPin.channel} · {tooltipPin.label}
                    </strong>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      {formatAge(scoutPinAgeMinutes(tooltipPin, now))} · {tooltipPin.placedBy}
                    </div>
                    {tooltipPin.claimedBy ? (
                      <div style={{ fontSize: 11, marginTop: 4 }}>Idzie: <b>{tooltipPin.claimedBy}</b></div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        disabled={currentHuntRole !== 'hunter' || Boolean(tooltipPin.claimedBy && tooltipPin.claimedBy !== actorName)}
                        onClick={() => toggleGoing(tooltipPin)}
                        type="button"
                      >
                        {tooltipPin.claimedBy === actorName ? 'Nie idę' : 'Idę'}
                      </button>
                      <button
                        disabled={currentHuntRole !== 'hunter'}
                        onClick={() => killAndComplete(tooltipPin)}
                        type="button"
                      >
                        Zbite
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {!miniMode ? (
                <p className="respawn-map-help">
                  {!party
                    ? 'Najpierw utwórz party albo dołącz kodem.'
                    : allChannels
                      ? 'Podgląd wszystkich CH. Aby dodać pinezkę wybierz konkretny kanał.'
                      : currentHuntRole === 'scout'
                        ? 'Scout: klik mapy dodaje pinezkę w kolorze aktualnego CH.'
                        : 'Bijący: wybierz pinezkę, kliknij „Idę”, a po zbiciu „Zbite”.'}
                </p>
              ) : null}

              {selectedPin ? (
                <div className="respawn-party-feed">
                  <span>Wybrana pinezka</span>
                  <p>
                    <b style={{ color: channelColor(selectedPin.channel) }}>CH{selectedPin.channel}</b> ·{' '}
                    <b>{selectedPin.label}</b> ({scoutPinKindLabel(selectedPin.kind)}) ·{' '}
                    {formatAge(scoutPinAgeMinutes(selectedPin, now))}
                  </p>
                  <p>
                    {selectedPin.placedBy} · TTL{' '}
                    <b>{formatScoutPinRemaining(scoutPinRemainingMs(selectedPin, now))}</b>
                    {selectedPin.claimedBy ? ` · Idzie: ${selectedPin.claimedBy}` : ''}
                  </p>
                  <button
                    disabled={currentHuntRole !== 'hunter' || Boolean(selectedPin.claimedBy && selectedPin.claimedBy !== actorName)}
                    onClick={() => toggleGoing(selectedPin)}
                    type="button"
                  >
                    {selectedPin.claimedBy === actorName ? 'Nie idę' : 'Idę'}
                  </button>{' '}
                  <button disabled={currentHuntRole !== 'hunter'} onClick={() => killAndComplete(selectedPin)} type="button">
                    Zbite (+1)
                  </button>{' '}
                  <button onClick={() => dismissPin(selectedPin.id)} type="button">Usuń bez zbicia</button>
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
                  <p>Party ma jeden wspólny pokój. Kanały nie tworzą osobnych pokojów.</p>
                </header>
                <button className="respawn-party-toggle is-on" onClick={() => createParty('open')} type="button">
                  <span /> Otwarte party
                </button>
                <button className="respawn-party-toggle" onClick={() => createParty('closed')} type="button">
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
                  <button className="respawn-party-toggle is-on" disabled={!joinCodeInput.trim()} onClick={joinWithCode} type="button">
                    <span /> Dołącz
                  </button>
                </div>
              </>
            ) : (
              <>
                <header>
                  <span className="section-kicker">Drużyna</span>
                  <h2>{party.name}</h2>
                  <p>
                    Kod <b>{party.joinCode}</b> · {party.visibility === 'open' ? 'otwarte' : 'zamknięte'} · zbicia: <b>{party.sessionKills}</b>
                  </p>
                  <p className="respawn-list-lead">
                    Wspólna mapa: <b>{party.mapKey}</b> ·{' '}
                    <b style={{ color: channelColor(party.activeChannel) }}>CH{party.activeChannel}</b>
                  </p>
                </header>

                <div className="respawn-party-feed">
                  <span>Moja rola w tej sesji</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={currentHuntRole === 'scout' ? 'respawn-party-toggle is-on' : 'respawn-party-toggle'}
                      onClick={() => setHuntRole('scout')}
                      type="button"
                    >
                      <span /> Scout
                    </button>
                    <button
                      className={currentHuntRole === 'hunter' ? 'respawn-party-toggle is-on' : 'respawn-party-toggle'}
                      onClick={() => setHuntRole('hunter')}
                      type="button"
                    >
                      <span /> Bijący
                    </button>
                  </div>
                </div>

                {!viewingSharedPartyMap ? (
                  <div className="respawn-party-feed">
                    <span>Twój widok jest inny niż wspólna mapa</span>
                    <button className="respawn-party-toggle" onClick={jumpToPartyMap} type="button">
                      <span /> Skocz do mapy party
                    </button>
                    <button className="respawn-party-toggle is-on" disabled={allChannels} onClick={syncPartyToMyView} type="button">
                      <span /> {allChannels ? 'Wybierz konkretny CH' : 'Ustaw mój widok jako wspólny'}
                    </button>
                  </div>
                ) : null}

                <button
                  className={`respawn-party-toggle ${party.visibility === 'open' ? 'is-on' : ''}`}
                  onClick={toggleVisibility}
                  type="button"
                >
                  <span /> {party.visibility === 'open' ? 'Party otwarte · zamknij' : 'Party zamknięte · otwórz'}
                </button>

                <div className="respawn-party-members">
                  {party.members.map((member) => (
                    <div key={member.id}>
                      <span className="respawn-member-dot is-online" />
                      <strong>{member.displayName}</strong>
                      <small>
                        {member.role === 'leader' ? 'lider · ' : ''}
                        {member.huntRole === 'scout' ? 'Scout' : 'Bijący'}
                      </small>
                    </div>
                  ))}
                </div>

                <div className={`respawn-party-feed ${styles.pinList}`}>
                  <span>Aktywne pinezki ({sidebarPins.length})</span>
                  {sidebarPins.length === 0 ? (
                    <p>Brak aktywnych pinezek.</p>
                  ) : (
                    <ul className={styles.pinListItems}>
                      {sidebarPins.map((pin) => {
                        const remaining = formatScoutPinRemaining(scoutPinRemainingMs(pin, now));
                        const color = channelColor(pin.channel);
                        return (
                          <li
                            className={`${styles.pinListItem}${selectedPinId === pin.id ? ` ${styles.pinListItemSelected}` : ''}`}
                            key={pin.id}
                            style={{ borderColor: color }}
                          >
                            <button className={styles.pinListSelect} onClick={() => selectPinFromList(pin)} type="button">
                              <strong><span style={{ color }}>CH{pin.channel}</span> · {pin.label}</strong>
                              <small>
                                {formatAge(scoutPinAgeMinutes(pin, now))} · {pin.placedBy}
                                {pin.claimedBy ? ` · Idzie: ${pin.claimedBy}` : ''}
                              </small>
                              <b className={styles.pinListTtl}>TTL {remaining}</b>
                            </button>
                            <button
                              aria-label={`Usuń ${pin.label}`}
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

                {completedPins.length > 0 && !miniMode ? (
                  <div className="respawn-party-feed">
                    <span>Ostatnio zbite</span>
                    {completedPins.map((pin) => (
                      <p key={`done-${pin.id}`}>
                        <b style={{ color: channelColor(pin.channel) }}>CH{pin.channel}</b> · {pin.label} ·{' '}
                        {pin.completedBy ?? 'Bijący'}
                      </p>
                    ))}
                  </div>
                ) : null}

                {!miniMode ? (
                  <div className="respawn-party-feed">
                    <span>Zaproszenie / dostęp</span>
                    <label className="catalog-search">
                      <span className="sr-only">Nazwa osoby</span>
                      <input onChange={(event) => setRequestName(event.target.value)} placeholder="Nazwa osoby do party" value={requestName} />
                    </label>
                    <button className="respawn-party-toggle" disabled={!requestName.trim()} onClick={addRequest} type="button">
                      <span /> Dodaj prośbę
                    </button>
                    {party.requests
                      .filter((request) => request.status === 'pending')
                      .map((request) => (
                        <p key={request.id}>
                          <b>{request.displayName}</b> prosi{' '}
                          <button onClick={() => resolveJoinRequest(request.id, true)} type="button">Przyjmij</button>{' '}
                          <button onClick={() => resolveJoinRequest(request.id, false)} type="button">Odrzuć</button>
                        </p>
                      ))}
                  </div>
                ) : null}

                <a className="respawn-party-toggle is-on" href={economyHref}>Dodaj drop z tej sesji</a>
                <button className="respawn-party-toggle" onClick={leaveParty} type="button">
                  <span /> Opuść party
                </button>
              </>
            )}
          </aside>
        </section>

        <p aria-live="polite" className="respawn-notice">{notice}</p>
        {!miniMode ? (
          <p className="respawn-data-note">
            „Podgląd wszystkich” nie jest kanałem — pinezka zawsze zapisuje konkretny CH. Kolor CH jest stały i identyczny na przycisku, mapie i liście.{' '}
            {connectionStatus === 'online'
              ? 'Role, „Idę”, zbicia i pinezki synchronizuje wspólny pokój player-team.'
              : 'Tryb offline używa lokalnego cache.'}
          </p>
        ) : null}
      </main>
    </AppShell>
  );
}
