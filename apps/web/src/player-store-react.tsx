'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  PLAYER_STORE_KEY,
  acceptIncomingInvitation,
  addProgressionTimer,
  addWorkspaceNote,
  applyTaskOutcome,
  assignItemToSet,
  cancelDiscordAuth,
  completeDiscordAuth,
  confirmItemLocation,
  createCharacter,
  createEquipmentItem,
  createEquipmentSet,
  createInitialPlayerStore,
  createOutgoingInvitation,
  createWorkspace,
  declineIncomingInvitation,
  ensureCharacterProgressionTimers,
  markTimerDone,
  parsePlayerStore,
  removeItemFromSet,
  seedDemoData,
  serializePlayerStore,
  setActiveCharacterSet,
  startDiscordAuth,
  touchLastOpened,
  updateCharacter,
  updateEquipmentItemBonuses,
  type AuthStatus,
  type CharacterClass,
  type CharacterGender,
  type EquipmentSlot,
  type PlayerStoreState,
  type ProgressionKind,
  type TaskOutcome,
} from './player-store';

import { getMyPlayerTeamState, putMyPlayerTeamState } from './player-team-online-api';
import { mergeServerSnapshot, shouldApplyServerSnapshot } from './player-team-sync';

interface PlayerStoreApi {
  readonly state: PlayerStoreState;
  readonly hydrated: boolean;
  readonly writesEnabled: boolean;
  startAuth: () => void;
  finishAuth: (outcome: Exclude<AuthStatus, 'unauthenticated' | 'authenticating'>) => void;
  cancelAuth: () => void;
  loadDemo: (options?: { readonly replace?: boolean }) => void;
  createWorkspace: (name: string) => string | null;
  openWorkspace: (workspaceId: string, characterId?: string | null) => void;
  createCharacter: (
    workspaceId: string,
    input: {
      readonly name: string;
      readonly characterClass: CharacterClass;
      readonly gender: CharacterGender;
      readonly level: number | null;
      readonly responsibleMemberId: string;
      readonly startingSetName?: string;
      readonly note?: string;
    },
  ) => string | null;
  updateCharacter: (
    workspaceId: string,
    characterId: string,
    input: {
      readonly name: string;
      readonly characterClass: CharacterClass;
      readonly gender: CharacterGender;
      readonly level: number | null;
      readonly responsibleMemberId: string;
      readonly note?: string;
    },
  ) => void;
  applyTaskOutcome: (workspaceId: string, taskId: string, outcome: TaskOutcome) => void;
  addNote: (workspaceId: string, body: string, characterId?: string | null) => void;
  assignItem: (
    workspaceId: string,
    characterId: string,
    setId: string,
    itemId: string,
    slot: EquipmentSlot,
  ) => void;
  removeItem: (
    workspaceId: string,
    characterId: string,
    setId: string,
    slot: EquipmentSlot,
  ) => void;
  setActiveSet: (workspaceId: string, characterId: string, setId: string) => void;
  createSet: (
    workspaceId: string,
    characterId: string,
    input: {
      readonly name: string;
      readonly description?: string;
      readonly makeActive?: boolean;
    },
  ) => string | null;
  confirmLocation: (workspaceId: string, itemId: string, locationLabel: string) => void;
  completeTimer: (workspaceId: string, timerId: string, operationId: string) => void;
  ensureProgressionTimers: (workspaceId: string, characterId: string) => void;
  addTimer: (
    workspaceId: string,
    characterId: string,
    input: { readonly kind?: ProgressionKind; readonly label?: string },
  ) => void;
  createItem: (
    workspaceId: string,
    input: {
      readonly name: string;
      readonly category: EquipmentSlot;
      readonly enhancement?: number;
      readonly bonuses: readonly string[];
      readonly planned?: boolean;
      readonly forCharacterClass?: CharacterClass;
    },
  ) => string | null;
  updateItemBonuses: (workspaceId: string, itemId: string, bonuses: readonly string[]) => void;
  sendInvitation: (
    workspaceId: string,
    recipient: {
      readonly discordUserId: string;
      readonly displayName: string;
      readonly initials: string;
    },
  ) => void;
  acceptInvitation: (invitationId: string) => void;
  declineInvitation: (invitationId: string) => void;
  returnToEntry: () => void;
  resetStore: () => void;
}

const PlayerStoreContext = createContext<PlayerStoreApi | null>(null);

export function PlayerStoreProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<PlayerStoreState>(() => createInitialPlayerStore());
  const [hydrated, setHydrated] = useState(false);
  const onlineEnabled =
    process.env.NEXT_PUBLIC_PLAYER_TEAM_ONLINE_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_PLAYER_TEAM_ONLINE_ENABLED !== 'false');

  const serverHydratedViewerIdRef = useRef<string | null>(null);
  const serverHydratedRef = useRef(false);
  const serverRevisionRef = useRef<number | null>(null);
  const pendingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(PLAYER_STORE_KEY);
    if (raw) {
      const parsed = parsePlayerStore(raw);
      if (parsed) setState(parsed);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!onlineEnabled) return;
    if (!hydrated) return;
    if (state.authStatus !== 'authenticated') return;
    if (!state.viewer) return;
    const viewerId = state.viewer.id;

    // Avoid repeated fetch after we already loaded for this viewer.
    if (serverHydratedViewerIdRef.current === viewerId && serverHydratedRef.current) return;

    serverHydratedRef.current = false;

    void (async () => {
      try {
        const response = await getMyPlayerTeamState({ viewerId });
        const localState = state;

        if (
          shouldApplyServerSnapshot({
            localState,
            localSyncedRevision: serverRevisionRef.current,
            serverState: response.state,
            serverRevision: response.revision,
          })
        ) {
          const parsed = parsePlayerStore(JSON.stringify(response.state));
          if (parsed) {
            const merged = mergeServerSnapshot(localState, parsed);
            setState(merged);
            window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(merged));
          }
          serverRevisionRef.current = response.revision;
        } else if (response.revision !== null) {
          serverRevisionRef.current = response.revision;
        }
      } catch (e) {
        // Keep local state as source of truth when server fails.
        console.error('player-team: sync-from-server failed', e);
      } finally {
        serverHydratedViewerIdRef.current = viewerId;
        serverHydratedRef.current = true;
      }
    })();
  }, [hydrated, onlineEnabled, state.authStatus, state.viewer]);

  useEffect(() => {
    if (!onlineEnabled) return;
    if (!hydrated) return;
    if (state.authStatus !== 'authenticated') return;
    if (!state.viewer) return;
    if (!serverHydratedRef.current) return;

    if (pendingSyncTimerRef.current) {
      clearTimeout(pendingSyncTimerRef.current);
      pendingSyncTimerRef.current = null;
    }

    pendingSyncTimerRef.current = setTimeout(() => {
      void (async () => {
        const viewerId = state.viewer!.id;
        const stateSnapshot = state as unknown as Record<string, unknown>;

        const result = await putMyPlayerTeamState({
          viewerId,
          state: stateSnapshot,
          expectedRevision: serverRevisionRef.current,
        });

        if (result.ok) {
          if (result.revision !== null) serverRevisionRef.current = result.revision;
          return;
        }

        if (result.conflict) {
          // Revision conflict: retry with blind upsert (expectedRevision = null).
          const retry = await putMyPlayerTeamState({
            viewerId,
            state: stateSnapshot,
            expectedRevision: null,
          });
          if (retry.ok && retry.revision !== null) {
            serverRevisionRef.current = retry.revision;
          } else if (!retry.ok && !retry.conflict) {
            console.error('player-team: blind-retry sync-to-server failed', retry.error);
          }
          return;
        }

        console.error('player-team: sync-to-server failed', result.error);
      })();
    }, 400);

    return () => {
      if (pendingSyncTimerRef.current) {
        clearTimeout(pendingSyncTimerRef.current);
        pendingSyncTimerRef.current = null;
      }
    };
  }, [hydrated, onlineEnabled, state, state.authStatus, state.viewer]);

  const apply = useCallback((updater: (current: PlayerStoreState) => PlayerStoreState) => {
    let snapshot: PlayerStoreState | null = null;
    setState((current) => {
      const next = updater(current);
      snapshot = next;
      window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(next));
      return next;
    });
    return snapshot;
  }, []);

  const writesEnabled =
    state.authStatus === 'authenticated' &&
    (state.connection === 'connected' || state.connection === 'reconnecting');

  const api = useMemo<PlayerStoreApi>(
    () => ({
      state,
      hydrated,
      writesEnabled,
      startAuth: () => {
        apply((current) => startDiscordAuth(current));
      },
      finishAuth: (outcome) => {
        apply((current) => completeDiscordAuth(current, outcome));
      },
      cancelAuth: () => {
        apply((current) => cancelDiscordAuth(current));
      },
      loadDemo: (options) => {
        apply((current) => seedDemoData(current, options));
      },
      createWorkspace: (name) => {
        let createdId: string | null = null;
        apply((current) => {
          const before = new Set(current.workspaces.map((workspace) => workspace.id));
          const next = createWorkspace(current, name);
          createdId = next.workspaces.find((workspace) => !before.has(workspace.id))?.id ?? null;
          return next;
        });
        return createdId;
      },
      openWorkspace: (workspaceId, characterId = null) => {
        apply((current) => touchLastOpened(current, workspaceId, characterId));
      },
      createCharacter: (workspaceId, input) => {
        let createdId: string | null = null;
        apply((current) => {
          const workspace = current.workspaces.find((entry) => entry.id === workspaceId);
          const before = new Set(workspace?.characters.map((character) => character.id) ?? []);
          const next = createCharacter(current, workspaceId, input);
          const updated = next.workspaces.find((entry) => entry.id === workspaceId);
          createdId =
            updated?.characters.find((character) => !before.has(character.id))?.id ?? null;
          return touchLastOpened(next, workspaceId, createdId);
        });
        return createdId;
      },
      updateCharacter: (workspaceId, characterId, input) => {
        apply((current) => updateCharacter(current, workspaceId, characterId, input));
      },
      applyTaskOutcome: (workspaceId, taskId, outcome) => {
        apply((current) => applyTaskOutcome(current, workspaceId, taskId, outcome));
      },
      addNote: (workspaceId, body, characterId = null) => {
        apply((current) => addWorkspaceNote(current, workspaceId, body, characterId));
      },
      assignItem: (workspaceId, characterId, setId, itemId, slot) => {
        apply((current) => assignItemToSet(current, workspaceId, characterId, setId, itemId, slot));
      },
      removeItem: (workspaceId, characterId, setId, slot) => {
        apply((current) => removeItemFromSet(current, workspaceId, characterId, setId, slot));
      },
      setActiveSet: (workspaceId, characterId, setId) => {
        apply((current) => setActiveCharacterSet(current, workspaceId, characterId, setId));
      },
      createSet: (workspaceId, characterId, input) => {
        let createdId: string | null = null;
        apply((current) => {
          const result = createEquipmentSet(current, workspaceId, characterId, input);
          createdId = result.setId;
          return result.state;
        });
        return createdId;
      },
      confirmLocation: (workspaceId, itemId, locationLabel) => {
        apply((current) => confirmItemLocation(current, workspaceId, itemId, locationLabel));
      },
      completeTimer: (workspaceId, timerId, operationId) => {
        apply((current) => markTimerDone(current, workspaceId, timerId, operationId));
      },
      ensureProgressionTimers: (workspaceId, characterId) => {
        apply((current) => ensureCharacterProgressionTimers(current, workspaceId, characterId));
      },
      addTimer: (workspaceId, characterId, input) => {
        apply((current) => addProgressionTimer(current, workspaceId, characterId, input));
      },
      createItem: (workspaceId, input) => {
        let createdId: string | null = null;
        apply((current) => {
          const result = createEquipmentItem(current, workspaceId, input);
          createdId = result.itemId;
          return result.state;
        });
        return createdId;
      },
      updateItemBonuses: (workspaceId, itemId, bonuses) => {
        apply((current) => updateEquipmentItemBonuses(current, workspaceId, itemId, bonuses));
      },
      sendInvitation: (workspaceId, recipient) => {
        apply((current) => createOutgoingInvitation(current, workspaceId, recipient));
      },
      acceptInvitation: (invitationId) => {
        apply((current) => acceptIncomingInvitation(current, invitationId));
      },
      declineInvitation: (invitationId) => {
        apply((current) => declineIncomingInvitation(current, invitationId));
      },
      returnToEntry: () => {
        apply((current) => ({
          ...current,
          authStatus: 'unauthenticated',
          connection: 'offline',
        }));
      },
      resetStore: () => {
        window.localStorage.removeItem(PLAYER_STORE_KEY);
        setState(createInitialPlayerStore());
      },
    }),
    [state, hydrated, writesEnabled, apply],
  );

  return <PlayerStoreContext.Provider value={api}>{children}</PlayerStoreContext.Provider>;
}

export function usePlayerStore(): PlayerStoreApi {
  const context = useContext(PlayerStoreContext);
  if (!context) {
    throw new Error('usePlayerStore must be used within PlayerStoreProvider');
  }
  return context;
}
