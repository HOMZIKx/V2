'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  PLAYER_STORE_KEY,
  acceptIncomingInvitation,
  addWorkspaceNote,
  applyTaskOutcome,
  assignItemToSet,
  cancelDiscordAuth,
  completeDiscordAuth,
  confirmItemLocation,
  createCharacter,
  createEquipmentItem,
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
  type AuthStatus,
  type CharacterClass,
  type CharacterGender,
  type EquipmentSlot,
  type PlayerStoreState,
  type TaskOutcome,
} from './player-store';

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
  confirmLocation: (workspaceId: string, itemId: string, locationLabel: string) => void;
  completeTimer: (workspaceId: string, timerId: string, operationId: string) => void;
  ensureProgressionTimers: (workspaceId: string, characterId: string) => void;
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
  ) => void;
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

  useEffect(() => {
    const raw = window.localStorage.getItem(PLAYER_STORE_KEY);
    if (raw) {
      const parsed = parsePlayerStore(raw);
      if (parsed) setState(parsed);
    }
    setHydrated(true);
  }, []);

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
      confirmLocation: (workspaceId, itemId, locationLabel) => {
        apply((current) => confirmItemLocation(current, workspaceId, itemId, locationLabel));
      },
      completeTimer: (workspaceId, timerId, operationId) => {
        apply((current) => markTimerDone(current, workspaceId, timerId, operationId));
      },
      ensureProgressionTimers: (workspaceId, characterId) => {
        apply((current) => ensureCharacterProgressionTimers(current, workspaceId, characterId));
      },
      createItem: (workspaceId, input) => {
        apply((current) => createEquipmentItem(current, workspaceId, input));
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
