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
  removeWorkspaceNote,
  addItemNote,
  removeItemNote,
  applyTaskOutcome,
  assignItemToSet,
  cancelDiscordAuth,
  completeDiscordAuth,
  updateViewerProfile,
  confirmItemLocation,
  createCharacter,
  createEquipmentItem,
  createEquipmentSet,
  renameEquipmentSet,
  createInitialPlayerStore,
  createOutgoingInvitation,
  createWorkspace,
  renameWorkspace,
  removeWorkspaceMember,
  archiveWorkspace,
  updateWorkspaceNotifyPrefs,
  updateMemberNotifyPrefs,
  listTeamNotifyDiscordRecipients,
  declineIncomingInvitation,
  ensureCharacterProgressionTimers,
  markTimerDone,
  parsePlayerStore,
  removeItemFromSet,
  unequipItemToBag,
  removeProgressionTimer,
  seedDemoData,
  serializePlayerStore,
  setActiveCharacterSet,
  startDiscordAuth,
  touchLastOpened,
  updateCharacter,
  archiveCharacter,
  archiveEquipmentItem,
  updateEquipmentItemCard,
  updateEquipmentItemBonuses,
  updateEquipmentItemWeaponStats,
  type AuthStatus,
  type DiscordAuthViewerInput,
  type PlayerIdentity,
  type CharacterClass,
  type CharacterGender,
  type CharacterSkillPath,
  type EquipmentSlot,
  type PlayerStoreState,
  type ProgressionKind,
  type TaskOutcome,
  type WorkspaceRecord,
} from './player-store';
import type { CharacterAppearanceLook } from './character-profile';

import { getMyPlayerTeamState, putMyPlayerTeamState, resolvePlayerTeamDemoViewerId } from './player-team-online-api';
import { mergeServerSnapshot, shouldApplyServerSnapshot } from './player-team-sync';
import { preserveHuntFieldsOnPut } from './hunt-snapshot';
import { syncKingdomWarRecipients } from './discord-notify-api';
import {
  getSharedWorkspaceState,
  putSharedWorkspaceState,
  subscribeSharedWorkspaceState,
} from './player-team-workspace-live-api';

interface PlayerStoreApi {
  readonly state: PlayerStoreState;
  readonly hydrated: boolean;
  readonly writesEnabled: boolean;
  startAuth: () => void;
  finishAuth: (
    outcome: Exclude<AuthStatus, 'unauthenticated' | 'authenticating'>,
    identity?: DiscordAuthViewerInput | PlayerIdentity,
  ) => void;
  cancelAuth: () => void;
  loadDemo: (options?: { readonly replace?: boolean }) => void;
  createWorkspace: (name: string) => string | null;
  renameWorkspace: (workspaceId: string, name: string) => void;
  removeWorkspaceMember: (workspaceId: string, memberId: string) => void;
  archiveWorkspace: (workspaceId: string) => void;
  updateNotifyPrefs: (
    workspaceId: string,
    patch: { readonly characterTimers?: boolean; readonly kingdomWar?: boolean },
  ) => void;
  updateMyNotifyPrefs: (
    workspaceId: string,
    patch: { readonly characterTimers?: boolean; readonly kingdomWar?: boolean },
  ) => void;
  openWorkspace: (workspaceId: string, characterId?: string | null) => void;
  createCharacter: (
    workspaceId: string,
    input: {
      readonly name: string;
      readonly characterClass: CharacterClass;
      readonly skillPath: CharacterSkillPath;
      readonly appearanceLook?: CharacterAppearanceLook;
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
      readonly skillPath: CharacterSkillPath;
      readonly appearanceLook?: CharacterAppearanceLook;
      readonly gender: CharacterGender;
      readonly level: number | null;
      readonly responsibleMemberId: string;
      readonly note?: string;
    },
  ) => void;
  archiveCharacter: (workspaceId: string, characterId: string) => void;
  applyTaskOutcome: (workspaceId: string, taskId: string, outcome: TaskOutcome) => void;
  addNote: (
    workspaceId: string,
    body: string,
    characterId?: string | null,
    scope?: 'workspace' | 'character' | 'equipment' | null,
  ) => void;
  removeNote: (workspaceId: string, noteId: string) => void;
  addItemNote: (workspaceId: string, itemId: string, body: string) => void;
  removeItemNote: (workspaceId: string, itemId: string, noteId: string) => void;
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
  unequipItem: (workspaceId: string, itemId: string) => void;
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
  renameSet: (
    workspaceId: string,
    characterId: string,
    setId: string,
    name: string,
  ) => boolean;
  confirmLocation: (workspaceId: string, itemId: string, locationLabel: string) => void;
  completeTimer: (
    workspaceId: string,
    timerId: string,
    operationId: string,
    durationMinutes?: number,
  ) => void;
  ensureProgressionTimers: (workspaceId: string, characterId: string) => void;
  addTimer: (
    workspaceId: string,
    characterId: string,
    input: { readonly kind?: ProgressionKind; readonly label?: string; readonly durationMinutes?: number },
  ) => void;
  removeTimer: (workspaceId: string, timerId: string) => void;
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
  updateItem: (
    workspaceId: string,
    itemId: string,
    input: {
      readonly name: string;
      readonly category: EquipmentSlot;
      readonly enhancement?: number;
      readonly bonuses: readonly string[];
      readonly forCharacterClass?: CharacterClass;
    },
  ) => boolean;
  archiveItem: (workspaceId: string, itemId: string) => void;
  updateItemBonuses: (
    workspaceId: string,
    itemId: string,
    bonuses: readonly string[],
    options?: { readonly enhancement?: number },
  ) => void;
  updateItemWeaponStats: (
    workspaceId: string,
    itemId: string,
    patch: {
      readonly averageDamagePercent?: number | null;
      readonly skillDamagePercent?: number | null;
      readonly attackValuePvm?: number | null;
      readonly magicAttackValuePvm?: number | null;
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
  updateViewerProfile: (patch: {
    readonly displayName: string;
    readonly avatarNote?: string;
    readonly profileSetupDone?: boolean;
  }) => void;
  resetStore: () => void;
}

const PlayerStoreContext = createContext<PlayerStoreApi | null>(null);

function parseSharedWorkspace(
  current: PlayerStoreState,
  workspaceId: string,
  raw: Record<string, unknown>,
): WorkspaceRecord | null {
  const parsed = parsePlayerStore(JSON.stringify({ ...current, workspaces: [raw] }));
  const workspace = parsed?.workspaces[0] ?? null;
  return workspace?.id === workspaceId ? workspace : null;
}

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
  const workspaceRevisionRef = useRef<Map<string, number>>(new Map());
  const workspaceSerializedRef = useRef<Map<string, string>>(new Map());
  const workspaceStreamsRef = useRef<Map<string, EventSource>>(new Map());
  const workspaceSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const workspaceIdsKey = state.workspaces.map((workspace) => workspace.id).sort().join('|');

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
    const viewerId = resolvePlayerTeamDemoViewerId(state.viewer);

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
        const viewerId = resolvePlayerTeamDemoViewerId(state.viewer!);
        const localSnapshot = state as unknown as Record<string, unknown>;

        let stateSnapshot = localSnapshot;
        try {
          const latest = await getMyPlayerTeamState({ viewerId });
          stateSnapshot = preserveHuntFieldsOnPut(localSnapshot, latest.state);
          if (latest.revision !== null) {
            serverRevisionRef.current = latest.revision;
          }
        } catch {
          // Fall back to local-only put if GET fails. Backend revision protection still applies.
        }

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
          try {
            const latest = await getMyPlayerTeamState({ viewerId });
            const merged = preserveHuntFieldsOnPut(localSnapshot, latest.state);
            const retry = await putMyPlayerTeamState({
              viewerId,
              state: merged,
              expectedRevision: latest.revision,
            });
            if (retry.ok && retry.revision !== null) {
              serverRevisionRef.current = retry.revision;
            } else if (!retry.ok && retry.conflict) {
              console.warn('player-team: repeated viewer snapshot conflict; refusing blind overwrite');
            } else if (!retry.ok) {
              console.error('player-team: conflict-retry sync-to-server failed', retry.error);
            }
          } catch (e) {
            console.error('player-team: conflict-retry failed', e);
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

  const applySharedWorkspace = useCallback(
    (workspaceId: string, raw: Record<string, unknown>, revision: number) => {
      setState((current) => {
        const incoming = parseSharedWorkspace(current, workspaceId, raw);
        if (!incoming) return current;
        const existing = current.workspaces.find((workspace) => workspace.id === workspaceId);
        if (!existing) return current;

        const serialized = JSON.stringify(incoming);
        workspaceRevisionRef.current.set(workspaceId, revision);
        workspaceSerializedRef.current.set(workspaceId, serialized);

        if (JSON.stringify(existing) === serialized) return current;

        const next = {
          ...current,
          workspaces: current.workspaces.map((workspace) =>
            workspace.id === workspaceId ? incoming : workspace,
          ),
        };
        window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(next));
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const streams = workspaceStreamsRef.current;
    const ids = new Set(state.workspaces.map((workspace) => workspace.id));

    if (
      !onlineEnabled ||
      !hydrated ||
      state.authStatus !== 'authenticated' ||
      !state.viewer
    ) {
      for (const stream of streams.values()) stream.close();
      streams.clear();
      workspaceRevisionRef.current.clear();
      workspaceSerializedRef.current.clear();
      return;
    }

    for (const [workspaceId, stream] of streams) {
      if (ids.has(workspaceId)) continue;
      stream.close();
      streams.delete(workspaceId);
      workspaceRevisionRef.current.delete(workspaceId);
      workspaceSerializedRef.current.delete(workspaceId);
    }

    for (const workspaceId of ids) {
      if (streams.has(workspaceId)) continue;
      const stream = subscribeSharedWorkspaceState(workspaceId, (snapshot) => {
        const knownRevision = workspaceRevisionRef.current.get(workspaceId);
        if (knownRevision !== undefined && snapshot.revision <= knownRevision) return;
        applySharedWorkspace(workspaceId, snapshot.state, snapshot.revision);
      });
      streams.set(workspaceId, stream);
    }
  }, [applySharedWorkspace, hydrated, onlineEnabled, state.authStatus, state.viewer, workspaceIdsKey]);

  useEffect(() => {
    if (
      !onlineEnabled ||
      !hydrated ||
      state.authStatus !== 'authenticated' ||
      !state.viewer
    ) {
      return;
    }

    const timers = workspaceSyncTimersRef.current;
    const currentIds = new Set(state.workspaces.map((workspace) => workspace.id));
    for (const [workspaceId, timer] of timers) {
      if (currentIds.has(workspaceId)) continue;
      clearTimeout(timer);
      timers.delete(workspaceId);
    }

    for (const workspace of state.workspaces) {
      const expectedRevision = workspaceRevisionRef.current.get(workspace.id);
      if (expectedRevision === undefined) continue;
      const serialized = JSON.stringify(workspace);
      if (workspaceSerializedRef.current.get(workspace.id) === serialized) continue;

      const previousTimer = timers.get(workspace.id);
      if (previousTimer) clearTimeout(previousTimer);

      const timer = setTimeout(() => {
        timers.delete(workspace.id);
        void (async () => {
          const latestExpectedRevision = workspaceRevisionRef.current.get(workspace.id);
          if (latestExpectedRevision === undefined) return;

          const result = await putSharedWorkspaceState({
            workspace,
            expectedRevision: latestExpectedRevision,
          });
          if (result.ok) {
            workspaceRevisionRef.current.set(workspace.id, result.snapshot.revision);
            workspaceSerializedRef.current.set(
              workspace.id,
              JSON.stringify(result.snapshot.state),
            );
            return;
          }

          if (result.conflict) {
            try {
              const latest = await getSharedWorkspaceState(workspace.id);
              applySharedWorkspace(workspace.id, latest.state, latest.revision);
            } catch (error) {
              console.error('player-team: live workspace conflict refresh failed', error);
            }
            return;
          }

          console.error('player-team: live workspace write failed', result.error);
        })();
      }, 120);
      timers.set(workspace.id, timer);
    }
  }, [applySharedWorkspace, hydrated, onlineEnabled, state.authStatus, state.viewer, state.workspaces]);

  useEffect(
    () => () => {
      for (const stream of workspaceStreamsRef.current.values()) stream.close();
      workspaceStreamsRef.current.clear();
      for (const timer of workspaceSyncTimersRef.current.values()) clearTimeout(timer);
      workspaceSyncTimersRef.current.clear();
    },
    [],
  );

  const apply = useCallback((updater: (current: PlayerStoreState) => PlayerStoreState) => {
    let snapshot: PlayerStoreState | null = null;
    setState((current) => {
      const next = updater(current);
      snapshot = next;
      if (Object.is(next, current)) return current;
      window.localStorage.setItem(PLAYER_STORE_KEY, serializePlayerStore(next));
      return next;
    });
    return snapshot;
  }, []);

  const writesEnabled =
    state.authStatus === 'authenticated' &&
    (state.connection === 'connected' || state.connection === 'reconnecting');

  const syncWarRecipientsFromState = useCallback((next: PlayerStoreState) => {
    const ids = new Set<string>();
    for (const workspace of next.workspaces) {
      if (workspace.archived) continue;
      for (const id of listTeamNotifyDiscordRecipients(workspace, 'kingdomWar', next.viewer)) {
        ids.add(id);
      }
    }
    void syncKingdomWarRecipients([...ids]);
  }, []);

  const api = useMemo<PlayerStoreApi>(
    () => ({
      state,
      hydrated,
      writesEnabled,
      startAuth: () => {
        apply((current) => startDiscordAuth(current));
      },
      finishAuth: (outcome, identity) => {
        apply((current) => completeDiscordAuth(current, outcome, identity));
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
      renameWorkspace: (workspaceId, name) => {
        apply((current) => renameWorkspace(current, workspaceId, name));
      },
      removeWorkspaceMember: (workspaceId, memberId) => {
        apply((current) => removeWorkspaceMember(current, workspaceId, memberId));
      },
      archiveWorkspace: (workspaceId) => {
        apply((current) => archiveWorkspace(current, workspaceId));
      },
      updateNotifyPrefs: (workspaceId, patch) => {
        apply((current) => {
          const next = updateWorkspaceNotifyPrefs(current, workspaceId, patch);
          syncWarRecipientsFromState(next);
          return next;
        });
      },
      updateMyNotifyPrefs: (workspaceId, patch) => {
        apply((current) => {
          const next = updateMemberNotifyPrefs(current, workspaceId, patch);
          syncWarRecipientsFromState(next);
          return next;
        });
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
      archiveCharacter: (workspaceId, characterId) => {
        apply((current) => archiveCharacter(current, workspaceId, characterId));
      },
      applyTaskOutcome: (workspaceId, taskId, outcome) => {
        apply((current) => applyTaskOutcome(current, workspaceId, taskId, outcome));
      },
      addNote: (workspaceId, body, characterId = null, scope = null) => {
        apply((current) => addWorkspaceNote(current, workspaceId, body, characterId, scope));
      },
      removeNote: (workspaceId, noteId) => {
        apply((current) => removeWorkspaceNote(current, workspaceId, noteId));
      },
      addItemNote: (workspaceId, itemId, body) => {
        apply((current) => addItemNote(current, workspaceId, itemId, body));
      },
      removeItemNote: (workspaceId, itemId, noteId) => {
        apply((current) => removeItemNote(current, workspaceId, itemId, noteId));
      },
      assignItem: (workspaceId, characterId, setId, itemId, slot) => {
        apply((current) => assignItemToSet(current, workspaceId, characterId, setId, itemId, slot));
      },
      removeItem: (workspaceId, characterId, setId, slot) => {
        apply((current) => removeItemFromSet(current, workspaceId, characterId, setId, slot));
      },
      unequipItem: (workspaceId, itemId) => {
        apply((current) => unequipItemToBag(current, workspaceId, itemId));
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
      renameSet: (workspaceId, characterId, setId, name) => {
        let ok = false;
        apply((current) => {
          const result = renameEquipmentSet(current, workspaceId, characterId, setId, name);
          ok = result.ok;
          return result.state;
        });
        return ok;
      },
      confirmLocation: (workspaceId, itemId, locationLabel) => {
        apply((current) => confirmItemLocation(current, workspaceId, itemId, locationLabel));
      },
      completeTimer: (workspaceId, timerId, operationId, durationMinutes) => {
        apply((current) =>
          markTimerDone(current, workspaceId, timerId, operationId, durationMinutes),
        );
      },
      ensureProgressionTimers: (workspaceId, characterId) => {
        apply((current) => ensureCharacterProgressionTimers(current, workspaceId, characterId));
      },
      addTimer: (workspaceId, characterId, input) => {
        apply((current) => addProgressionTimer(current, workspaceId, characterId, input));
      },
      removeTimer: (workspaceId, timerId) => {
        apply((current) => removeProgressionTimer(current, workspaceId, timerId));
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
      updateItem: (workspaceId, itemId, input) => {
        let ok = false;
        apply((current) => {
          const result = updateEquipmentItemCard(current, workspaceId, itemId, input);
          ok = result.ok;
          return result.state;
        });
        return ok;
      },
      archiveItem: (workspaceId, itemId) => {
        apply((current) => archiveEquipmentItem(current, workspaceId, itemId));
      },
      updateItemBonuses: (workspaceId, itemId, bonuses, options) => {
        apply((current) =>
          updateEquipmentItemBonuses(current, workspaceId, itemId, bonuses, options),
        );
      },
      updateItemWeaponStats: (workspaceId, itemId, patch) => {
        apply((current) => updateEquipmentItemWeaponStats(current, workspaceId, itemId, patch));
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
      updateViewerProfile: (patch) => {
        apply((current) => updateViewerProfile(current, patch));
      },
      resetStore: () => {
        window.localStorage.removeItem(PLAYER_STORE_KEY);
        setState(createInitialPlayerStore());
      },
    }),
    [state, hydrated, writesEnabled, apply, syncWarRecipientsFromState],
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
