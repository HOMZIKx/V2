/**
 * DESTILED first-player mock store (D-038–D-060 / D-061).
 * Shared in-browser state for Discord entry → workspace → character → EQ/timers/notes → history.
 * Not a production API. Persistence: localStorage only.
 */

import {
  equipmentSlots,
  slotLabels,
  type EquipmentAssignments,
  type EquipmentSlot,
} from './character-equipment';
import {
  characterClassLabels,
  characterSkillPathLabels,
  DEFAULT_APPEARANCE_LOOK,
  defaultSkillPathForClass,
  getApprovedCharacterRender,
  isCharacterAppearanceLook,
  isSkillPathForClass,
  type CharacterAppearanceLook,
  type CharacterClass,
  type CharacterGender,
  type CharacterSkillPath,
} from './character-profile';
import {
  clampEnhancement,
  equipmentSlotForCategory,
  findGameItemByCardName,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  clampAverageDamagePercent,
  clampSkillDamagePercent,
  mergeItemBonusStorage,
  parseEnhancementFromName,
  resolveItemBonuses,
  resolveItemIconPath,
  splitItemBonuses,
  stripEnhancementFromName,
  weaponHasAverageSkillDamage,
  weaponHasPhPvmAttackBonuses,
} from './item-catalog';
import type { CatalogLayer } from './member-dashboard';
import {
  biologistProgressLabel,
  biologistQuestById,
  biologistQuestForLevel,
  horseAdvanceDetail,
  inferProgressionKind,
  nextMidnightIso,
  nextMidnightLabel,
  progressionCycleByKind,
  progressionKindsForLevel,
  progressionTimerIcons,
  progressionTimerLabels,
  projectHardHorseRules,
  projectHardProductFacts,
  restartAfterDone,
  type ProgressionKind,
} from './project-hard-progression';
import type { TeamHistoryResource } from './team-history';

export type { CharacterClass, CharacterGender, CharacterSkillPath, EquipmentSlot, ProgressionKind };

import type { MapHuntSnapshotV1, PartyHuntSnapshotV1 } from './hunt-snapshot';
import { parseMapHuntSnapshot, parsePartyHuntSnapshot } from './hunt-snapshot';

export const PLAYER_STORE_KEY = 'destiled:player-store:v1';

export type AuthStatus =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'cancelled'
  | 'unavailable'
  | 'ineligible'
  | 'revoked';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline' | 'revoked';
export type MembershipRole = 'owner' | 'member';
export type TimerStatus = 'ready' | 'running' | 'paused';
export type TaskStatus = 'ready' | 'upcoming' | 'done' | 'snoozed' | 'unavailable';
export type TaskOutcome = 'done' | 'snoozed' | 'unavailable';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type SetReadiness =
  'ready' | 'available_elsewhere' | 'missing' | 'stale' | 'conflict' | 'planned' | 'empty';

export interface PlayerIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly discordDisplayName: string;
  readonly initials: string;
  /** Discord snowflake when known — for later DMs / gateway; id stays V2 UUID. */
  readonly discordAccountId?: string;
  /** First-login / Mój profil — nick setup done. */
  readonly profileSetupDone?: boolean;
  /** Optional note about avatar (Discord avatar later). */
  readonly avatarNote?: string;
}

export interface TeamNotifyPrefs {
  /** Discord PW for character ProgressTimers (EQ/Timer). */
  readonly characterTimers: boolean;
  /** Discord PW for kingdom war reminders. */
  readonly kingdomWar: boolean;
}

export const DEFAULT_TEAM_NOTIFY_PREFS: TeamNotifyPrefs = {
  characterTimers: true,
  kingdomWar: true,
};

export function normalizeTeamNotifyPrefs(raw: unknown): TeamNotifyPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    characterTimers:
      typeof src.characterTimers === 'boolean'
        ? src.characterTimers
        : DEFAULT_TEAM_NOTIFY_PREFS.characterTimers,
    kingdomWar:
      typeof src.kingdomWar === 'boolean' ? src.kingdomWar : DEFAULT_TEAM_NOTIFY_PREFS.kingdomWar,
  };
}

export type NotifyPrefKey = keyof TeamNotifyPrefs;

/** Member override > team default > true (missing never disables). */
export function resolveEffectiveNotifyPrefs(
  workspace: { readonly notifyPrefs?: TeamNotifyPrefs | null },
  member?: { readonly notifyPrefs?: Partial<TeamNotifyPrefs> | null } | null,
): TeamNotifyPrefs {
  const team = normalizeTeamNotifyPrefs(workspace.notifyPrefs);
  const personal = member?.notifyPrefs;
  return {
    characterTimers:
      typeof personal?.characterTimers === 'boolean'
        ? personal.characterTimers
        : team.characterTimers,
    kingdomWar:
      typeof personal?.kingdomWar === 'boolean' ? personal.kingdomWar : team.kingdomWar,
  };
}

export function isNotifyPrefEnabled(
  workspace: { readonly notifyPrefs?: TeamNotifyPrefs | null },
  key: NotifyPrefKey,
  member?: { readonly notifyPrefs?: Partial<TeamNotifyPrefs> | null } | null,
): boolean {
  return resolveEffectiveNotifyPrefs(workspace, member)[key];
}


export function isDiscordSnowflakeId(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{17,20}$/.test(value.trim());
}

/** Resolve a team member's Discord snowflake for DM fan-out (never invents guild members). */
export function resolveMemberDiscordAccountId(
  member: WorkspaceMember,
  viewer?: PlayerIdentity | null,
): string | null {
  const fromMember = member.discordAccountId?.trim();
  if (isDiscordSnowflakeId(fromMember)) return fromMember!.trim();
  if (viewer && member.id === viewer.id) {
    const fromViewer = viewer.discordAccountId?.trim();
    if (isDiscordSnowflakeId(fromViewer)) return fromViewer!.trim();
  }
  if (isDiscordSnowflakeId(member.id)) return member.id.trim();
  return null;
}

/**
 * HARD fan-out allowlist: ONLY current team members with notifyPrefs[key] true
 * (default true if missing). Never expands to a Discord guild roster.
 */
export function listTeamNotifyDiscordRecipients(
  workspace: {
    readonly members: readonly WorkspaceMember[];
    readonly notifyPrefs?: TeamNotifyPrefs | null;
  },
  key: NotifyPrefKey,
  viewer?: PlayerIdentity | null,
): string[] {
  const ids = new Set<string>();
  for (const member of workspace.members) {
    if (!isNotifyPrefEnabled(workspace, key, member)) continue;
    const discordId = resolveMemberDiscordAccountId(member, viewer);
    if (discordId) ids.add(discordId);
  }
  return [...ids];
}




export interface WorkspaceMember {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly role: MembershipRole;
  readonly state: 'online' | 'away' | 'offline' | 'unknown';
  /** Discord snowflake when known — required for team DM fan-out. */
  readonly discordAccountId?: string;
  /** Personal Discord PW override — wins over team notifyPrefs; missing = inherit/true. */
  readonly notifyPrefs?: Partial<TeamNotifyPrefs>;
}

export interface EquipmentItemNote {
  readonly id: string;
  readonly body: string;
  readonly authorName: string;
  /** Display label (same style as WorkspaceNote.createdAtLabel). */
  readonly createdAt: string;
}

export interface EquipmentItem {
  readonly id: string;
  readonly name: string;
  readonly iconPath: string;
  readonly category: EquipmentSlot;
  /** Enhancement level shown on the card (+0 … +9). */
  readonly enhancement: number;
  readonly levelLabel: string;
  readonly bonuses: readonly string[];
  /** Team communication notes attached to this card (sync via workspace.items). */
  readonly notes: readonly EquipmentItemNote[];
  /**
   * Official Metin2 characteristic on weapons level 30/75 (wiki: Średnie Obrażenia).
   * Percent in roughly -60…+60; null = unset / invisible zero.
   */
  readonly averageDamagePercent: number | null;
  /**
   * Official Metin2 characteristic on weapons level 30/75 (wiki: Obrażenia Umiejętności).
   * Percent in roughly -30…+30; null = unset / invisible zero.
   */
  readonly skillDamagePercent: number | null;
  /**
   * PH presentation only: Attack Value PvM on weapons above level 25.
   * No invented defaults — store observed values or null.
   */
  readonly attackValuePvm: number | null;
  /**
   * PH presentation only: Magic Attack Value PvM on weapons above level 25.
   * No invented defaults — store observed values or null.
   */
  readonly magicAttackValuePvm: number | null;
  readonly catalogLayer: CatalogLayer;
  readonly lastConfirmedLocation: string | null;
  readonly lastConfirmedBy: string | null;
  readonly lastConfirmedAt: string | null;
  readonly archived: boolean;
  readonly planned: boolean;
  readonly revision: number;
}

export interface EquipmentSet {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly assignments: EquipmentAssignments;
}

export interface ProgressTimer {
  readonly id: string;
  readonly characterId: string;
  readonly label: string;
  readonly detail: string;
  readonly status: TimerStatus;
  readonly readyAtIso: string | null;
  readonly remainingLabel: string;
  readonly progressPercent: number;
  readonly lastActorName: string | null;
  readonly lastConfirmedAt: string | null;
  readonly discordReminder: boolean;
  readonly reminderState: 'on' | 'off' | 'unavailable';
  readonly operationId: string | null;
  /** Project Hard progression family when known. */
  readonly kind?: ProgressionKind;
  /** Illustration matching the cycle (book / soul stone / biologist / horse medal). */
  readonly iconPath?: string;
  /** Custom cycle length in minutes (manual timers). Presets use kind rules instead. */
  readonly durationMinutes?: number;
}

export interface TeamTask {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly characterId: string | null;
  readonly characterName: string;
  readonly assigneeName: string;
  readonly dueLabel: string;
  readonly status: TaskStatus;
  readonly source: 'team' | 'timer' | 'equipment';
}

export interface WorkspaceNote {
  readonly id: string;
  /** workspace = team board; character = per-character; equipment = shared EQ board notes */
  readonly scope: 'workspace' | 'character' | 'equipment';
  readonly characterId: string | null;
  readonly authorName: string;
  readonly body: string;
  readonly createdAtLabel: string;
  readonly revision: number;
  readonly pinned: boolean;
}

export interface CharacterRecord {
  readonly id: string;
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly skillPath: CharacterSkillPath;
  readonly appearanceLook: CharacterAppearanceLook;
  readonly gender: CharacterGender;
  readonly level: number | null;
  readonly responsibleMemberId: string;
  readonly note: string;
  readonly imagePath: string | null;
  readonly sets: readonly EquipmentSet[];
  readonly activeSetId: string;
  readonly revision: number;
  readonly archived: boolean;
}

export interface HistoryEntry {
  readonly id: string;
  readonly teamId: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly actorInitials: string;
  readonly characterId: string | null;
  readonly characterName: string | null;
  readonly resource: TeamHistoryResource;
  readonly title: string;
  readonly detail: string;
  readonly occurredAtLabel: string;
  readonly revision: number;
}

export interface PendingInvitation {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly inviterName: string;
  readonly recipientDiscordId: string;
  readonly recipientDisplayName: string;
  readonly status: InvitationStatus;
  readonly createdLabel: string;
  readonly expiresLabel: string;
  readonly revision: number;
}

export interface WorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Owner-closed / archived team — hidden from active switchers. */
  readonly archived: boolean;
  readonly members: readonly WorkspaceMember[];
  readonly characters: readonly CharacterRecord[];
  readonly items: readonly EquipmentItem[];
  readonly timers: readonly ProgressTimer[];
  readonly tasks: readonly TeamTask[];
  readonly notes: readonly WorkspaceNote[];
  readonly history: readonly HistoryEntry[];
  readonly invitations: readonly PendingInvitation[];
  /** Team Discord PW defaults — optional; missing keys default true. Member override wins. */
  readonly notifyPrefs?: TeamNotifyPrefs;
  readonly revision: number;
  readonly updatedLabel: string;
}

export interface PlayerStoreState {
  readonly authStatus: AuthStatus;
  readonly connection: ConnectionState;
  readonly viewer: PlayerIdentity | null;
  readonly workspaces: readonly WorkspaceRecord[];
  readonly pendingIncomingInvitations: readonly PendingInvitation[];
  readonly lastOpenedWorkspaceId: string | null;
  readonly lastOpenedCharacterId: string | null;
  readonly intendedDestination: string | null;
  readonly seededDemo: boolean;
  /** Personal Timers prefs/cache on /me/state — optional, must not collide with EQ. */
  readonly mapHunt?: MapHuntSnapshotV1 | null;
  /** Personal Party prefs/cache on /me/state — optional, must not collide with EQ. */
  readonly partyHunt?: PartyHuntSnapshotV1 | null;
}

const emptyAssignments = (): EquipmentAssignments => ({
  weapon: null,
  armor: null,
  helmet: null,
  shield: null,
  earrings: null,
  necklace: null,
  bracelet: null,
  shoes: null,
});

function nowLabel(): string {
  return 'teraz';
}

function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base) || createId('id');
  if (!taken.has(root)) return root;
  let index = 2;
  while (taken.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
}

function buildProgressionTimer(
  characterId: string,
  kind: ProgressionKind,
  level: number | null,
): ProgressTimer {
  const cycle = progressionCycleByKind(kind);
  const midnight = nextMidnightLabel();
  const base = {
    characterId,
    label: cycle.label,
    iconPath: cycle.iconPath,
    lastActorName: null as string | null,
    lastConfirmedAt: null as string | null,
    discordReminder: true,
    reminderState: 'unavailable' as const,
    operationId: null as string | null,
    kind,
  };

  if (kind === 'horse') {
    return {
      ...base,
      id: createId('timer-horse'),
      detail: `${horseAdvanceDetail(1, 2)} · ${cycle.detailReady}`,
      status: 'ready',
      readyAtIso: new Date().toISOString(),
      remainingLabel: cycle.remainingReady,
      progressPercent: 100,
    };
  }

  if (kind === 'biologist') {
    const quest = level !== null ? biologistQuestForLevel(level) : null;
    return {
      ...base,
      id: createId('timer-bio'),
      detail: quest
        ? `${biologistProgressLabel(quest, 0)} · ${
            quest.cooldownOnlyOnSuccess
              ? 'cooldown tylko po udanym oddaniu'
              : 'cooldown po każdej próbie'
          } · reset o północy`
        : cycle.detailReady,
      status: 'ready',
      readyAtIso: new Date().toISOString(),
      remainingLabel: cycle.remainingReady,
      progressPercent: 100,
    };
  }

  return {
    ...base,
    id: createId(`timer-${kind}`),
    detail: `${cycle.detailReady} · do ${midnight}`,
    status: 'ready',
    readyAtIso: new Date().toISOString(),
    remainingLabel: cycle.remainingReady,
    progressPercent: 100,
  };
}

/** Project Hard cyclical character timers: reading families + horse / biologist by level. */
export function defaultProgressionTimers(
  characterId: string,
  level: number | null,
): readonly ProgressTimer[] {
  return progressionKindsForLevel(level).map((kind) =>
    buildProgressionTimer(characterId, kind, level),
  );
}

export function createInitialPlayerStore(): PlayerStoreState {
  return {
    authStatus: 'unauthenticated',
    connection: 'offline',
    viewer: null,
    workspaces: [],
    pendingIncomingInvitations: [],
    lastOpenedWorkspaceId: null,
    lastOpenedCharacterId: null,
    intendedDestination: null,
    seededDemo: false,
  };
}

function historyEntry(
  teamId: string,
  actor: PlayerIdentity,
  partial: Omit<
    HistoryEntry,
    'id' | 'teamId' | 'actorId' | 'actorName' | 'actorInitials' | 'occurredAtLabel' | 'revision'
  > & {
    readonly revision: number;
  },
): HistoryEntry {
  return {
    id: createId('hist'),
    teamId,
    actorId: actor.id,
    actorName: actor.displayName,
    actorInitials: actor.initials,
    occurredAtLabel: nowLabel(),
    ...partial,
  };
}

function demoEquipmentItem(
  partial: Omit<
    EquipmentItem,
    | 'iconPath'
    | 'name'
    | 'enhancement'
    | 'bonuses'
    | 'notes'
    | 'averageDamagePercent'
    | 'skillDamagePercent'
    | 'attackValuePvm'
    | 'magicAttackValuePvm'
  > & {
    readonly baseName: string;
    readonly enhancement: number;
    readonly bonuses?: readonly string[];
    readonly notes?: readonly EquipmentItemNote[];
    readonly averageDamagePercent?: number | null;
    readonly skillDamagePercent?: number | null;
    readonly attackValuePvm?: number | null;
    readonly magicAttackValuePvm?: number | null;
    readonly iconPath?: string;
  },
): EquipmentItem {
  const enhancement = clampEnhancement(partial.enhancement);
  const name = formatEnhancedItemName(partial.baseName, enhancement);
  return {
    id: partial.id,
    name,
    enhancement,
    category: partial.category,
    levelLabel: partial.levelLabel,
    bonuses: resolveItemBonuses(partial.baseName, enhancement, partial.bonuses ?? []),
    averageDamagePercent: partial.averageDamagePercent ?? null,
    skillDamagePercent: partial.skillDamagePercent ?? null,
    attackValuePvm: partial.attackValuePvm ?? null,
    magicAttackValuePvm: partial.magicAttackValuePvm ?? null,
    catalogLayer: partial.catalogLayer,
    lastConfirmedLocation: partial.lastConfirmedLocation,
    lastConfirmedBy: partial.lastConfirmedBy,
    lastConfirmedAt: partial.lastConfirmedAt,
    archived: partial.archived,
    planned: partial.planned,
    revision: partial.revision,
    notes: partial.notes ?? [],
    iconPath: partial.iconPath ?? resolveItemIconPath(name),
  };
}

export function buildDemoWorkspace(viewer: PlayerIdentity): WorkspaceRecord {
  const midnight = nextMidnightLabel();
  const iceQuest = biologistQuestById('dull-ice')!;

  const items: EquipmentItem[] = [];
  const characters: CharacterRecord[] = [];

  return {
    id: 'asteria',
    name: 'Asteria',
    description: 'Wspólna przestrzeń postaci, ekwipunku i codziennych potwierdzeń zespołu.',
    archived: false,
    notifyPrefs: { ...DEFAULT_TEAM_NOTIFY_PREFS },
    revision: 19,
    updatedLabel: 'przed chwilą',
    members: [
      { id: 'mateusz', displayName: 'Mateusz', initials: 'M', role: 'owner', state: 'unknown' },
    ],
    characters,
    items,
    timers: [],
    tasks: [],
    notes: [],
    invitations: [],
    history: [],
  };
}

export interface DiscordAuthViewerInput {
  readonly displayName: string;
  readonly v2UserId?: string;
  readonly discordUserId?: string;
}

export function initialsFromDisplayName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function startDiscordAuth(state: PlayerStoreState): PlayerStoreState {
  return {
    ...state,
    authStatus: 'authenticating',
    intendedDestination: state.intendedDestination ?? '/',
  };
}

export function completeDiscordAuth(
  state: PlayerStoreState,
  outcome: Exclude<AuthStatus, 'unauthenticated' | 'authenticating'>,
  identity?: DiscordAuthViewerInput | PlayerIdentity,
): PlayerStoreState {
  if (outcome === 'authenticated') {
    let viewer: PlayerIdentity;
    if (identity && 'initials' in identity && typeof identity.id === 'string') {
      viewer = identity;
    } else {
      const input = identity as DiscordAuthViewerInput | undefined;
      const displayName = input?.displayName?.trim() || 'Mateusz';
      const v2UserId = input?.v2UserId?.trim();
      const discordAccountId = input?.discordUserId?.trim();
      const id = v2UserId || discordAccountId || 'mateusz';
      viewer = {
        id,
        displayName,
        discordDisplayName: displayName,
        initials: initialsFromDisplayName(displayName),
        ...(discordAccountId ? { discordAccountId } : {}),
      };
    }
    return {
      ...state,
      authStatus: 'authenticated',
      connection: 'connected',
      viewer,
      workspaces: state.workspaces,
      pendingIncomingInvitations: state.pendingIncomingInvitations,
    };
  }

  return {
    ...state,
    authStatus: outcome,
    connection: outcome === 'revoked' ? 'revoked' : 'offline',
    viewer: outcome === 'revoked' ? null : state.viewer,
    workspaces: outcome === 'revoked' ? [] : state.workspaces,
    lastOpenedWorkspaceId: outcome === 'revoked' ? null : state.lastOpenedWorkspaceId,
    lastOpenedCharacterId: outcome === 'revoked' ? null : state.lastOpenedCharacterId,
  };
}

export function updateViewerProfile(
  state: PlayerStoreState,
  patch: {
    readonly displayName: string;
    readonly avatarNote?: string;
    readonly profileSetupDone?: boolean;
  },
): PlayerStoreState {
  if (!state.viewer) return state;
  const displayName = patch.displayName.trim();
  if (displayName.length < 2) return state;
  const nextNote =
    typeof patch.avatarNote === 'string' ? patch.avatarNote.trim() : (state.viewer.avatarNote ?? '');
  const { avatarNote: _drop, ...restViewer } = state.viewer;
  return {
    ...state,
    viewer: {
      ...restViewer,
      displayName,
      initials: initialsFromDisplayName(displayName),
      profileSetupDone: patch.profileSetupDone ?? state.viewer.profileSetupDone ?? true,
      ...(nextNote ? { avatarNote: nextNote } : {}),
    },
  };
}

export function cancelDiscordAuth(state: PlayerStoreState): PlayerStoreState {
  return { ...state, authStatus: 'cancelled', connection: 'offline' };
}

export function seedDemoData(
  state: PlayerStoreState,
  options: { readonly replace?: boolean } = {},
): PlayerStoreState {
  if (!state.viewer) return state;
  return { ...state, seededDemo: options.replace === true ? true : state.seededDemo };
}

export function createOutgoingInvitation(
  state: PlayerStoreState,
  workspaceId: string,
  recipient: {
    readonly discordUserId: string;
    readonly displayName: string;
    readonly initials: string;
  },
): PlayerStoreState {
  return state;
}

export function findInvitation(
  state: PlayerStoreState,
  invitationId: string,
): PendingInvitation | null {
  const fromPending = state.pendingIncomingInvitations.find((entry) => entry.id === invitationId) ?? null;
  if (fromPending) return fromPending;
  for (const workspace of state.workspaces) {
    const hit = workspace.invitations.find((entry) => entry.id === invitationId);
    if (hit) return hit;
  }
  return null;
}

export function declineIncomingInvitation(state: PlayerStoreState, invitationId: string): PlayerStoreState {
  return state;
}

export function createWorkspace(state: PlayerStoreState, name: string): PlayerStoreState {
  return state;
}

export function renameWorkspace(state: PlayerStoreState, workspaceId: string, name: string): PlayerStoreState {
  return state;
}

export function removeWorkspaceMember(state: PlayerStoreState, workspaceId: string, memberId: string): PlayerStoreState {
  return state;
}

export function archiveWorkspace(state: PlayerStoreState, workspaceId: string): PlayerStoreState {
  return state;
}

export function updateWorkspaceNotifyPrefs(state: PlayerStoreState, workspaceId: string, patch: Partial<TeamNotifyPrefs>): PlayerStoreState {
  return state;
}

export function updateMemberNotifyPrefs(state: PlayerStoreState, workspaceId: string, patch: Partial<TeamNotifyPrefs>): PlayerStoreState {
  return state;
}

export function touchLastOpened(state: PlayerStoreState, workspaceId: string, characterId: string | null): PlayerStoreState {
  return state;
}

export function ensureCharacterProgressionTimers(state: PlayerStoreState, workspaceId: string, characterId: string): PlayerStoreState {
  return state;
}

export function createCharacter(state: PlayerStoreState, workspaceId: string, input: {
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly skillPath: CharacterSkillPath;
  readonly appearanceLook?: CharacterAppearanceLook;
  readonly gender: CharacterGender;
  readonly level: number | null;
  readonly responsibleMemberId: string;
  readonly startingSetName?: string;
  readonly note?: string;
}): PlayerStoreState { return state; }

export function updateCharacter(state: PlayerStoreState, workspaceId: string, characterId: string, input: {
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly skillPath: CharacterSkillPath;
  readonly appearanceLook?: CharacterAppearanceLook;
  readonly gender: CharacterGender;
  readonly level: number | null;
  readonly responsibleMemberId: string;
  readonly note?: string;
}): PlayerStoreState { return state; }

export function archiveCharacter(state: PlayerStoreState, workspaceId: string, characterId: string): PlayerStoreState { return state; }
export function applyTaskOutcome(state: PlayerStoreState, workspaceId: string, taskId: string, outcome: TaskOutcome): PlayerStoreState { return state; }
export function addWorkspaceNote(state: PlayerStoreState, workspaceId: string, body: string, characterId: string | null = null, scope: WorkspaceNote['scope'] | null = null): PlayerStoreState { return state; }
export function removeWorkspaceNote(state: PlayerStoreState, workspaceId: string, noteId: string): PlayerStoreState { return state; }
export function addItemNote(state: PlayerStoreState, workspaceId: string, itemId: string, body: string): PlayerStoreState { return state; }
export function removeItemNote(state: PlayerStoreState, workspaceId: string, itemId: string, noteId: string): PlayerStoreState { return state; }
export function assignItemToSet(state: PlayerStoreState, workspaceId: string, characterId: string, setId: string, itemId: string, slot: EquipmentSlot): PlayerStoreState { return state; }
export function unequipItemToBag(state: PlayerStoreState, workspaceId: string, itemId: string): PlayerStoreState { return state; }
export function removeItemFromSet(state: PlayerStoreState, workspaceId: string, characterId: string, setId: string, slot: EquipmentSlot): PlayerStoreState { return state; }
export function confirmItemLocation(state: PlayerStoreState, workspaceId: string, itemId: string, locationLabel: string): PlayerStoreState { return state; }
export function setActiveCharacterSet(state: PlayerStoreState, workspaceId: string, characterId: string, setId: string): PlayerStoreState { return state; }
export function createEquipmentSet(state: PlayerStoreState, workspaceId: string, characterId: string, input: { readonly name: string; readonly description?: string; readonly makeActive?: boolean; }): { readonly state: PlayerStoreState; readonly setId: string | null } { return { state, setId: null }; }
export function renameEquipmentSet(state: PlayerStoreState, workspaceId: string, characterId: string, setId: string, nameInput: string): { readonly state: PlayerStoreState; readonly ok: boolean } { return { state, ok: false }; }
export function markTimerDone(state: PlayerStoreState, workspaceId: string, timerId: string, operationId: string): PlayerStoreState { return state; }
export function addProgressionTimer(state: PlayerStoreState, workspaceId: string, characterId: string, input: { readonly kind?: ProgressionKind; readonly label?: string; readonly durationMinutes?: number }): PlayerStoreState { return state; }
export function removeProgressionTimer(state: PlayerStoreState, workspaceId: string, timerId: string): PlayerStoreState { return state; }
export function createEquipmentItem(state: PlayerStoreState, workspaceId: string, input: { readonly name: string; readonly category: EquipmentSlot; readonly enhancement?: number; readonly bonuses: readonly string[]; readonly planned?: boolean; readonly forCharacterClass?: CharacterClass; }): { readonly state: PlayerStoreState; readonly itemId: string | null } { return { state, itemId: null }; }
export function updateEquipmentItemBonuses(state: PlayerStoreState, workspaceId: string, itemId: string, bonuses: readonly string[], options?: { readonly enhancement?: number }): PlayerStoreState { return state; }
export function updateEquipmentItemWeaponStats(state: PlayerStoreState, workspaceId: string, itemId: string, patch: { readonly averageDamagePercent?: number | null; readonly skillDamagePercent?: number | null; readonly attackValuePvm?: number | null; readonly magicAttackValuePvm?: number | null; }): PlayerStoreState { return state; }
export function acceptIncomingInvitation(state: PlayerStoreState, invitationId: string): PlayerStoreState { return state; }
export function getWorkspace(state: PlayerStoreState, workspaceId: string): WorkspaceRecord | null { return state.workspaces.find((workspace) => workspace.id === workspaceId) ?? null; }
export function getCharacter(workspace: WorkspaceRecord, characterId: string): CharacterRecord | null { return workspace.characters.find((character) => character.id === characterId) ?? null; }
export function getSlotReadiness(workspace: WorkspaceRecord, character: CharacterRecord, set: EquipmentSet, slot: EquipmentSlot): SetReadiness { return 'empty'; }
export function getReadyTimers(state: PlayerStoreState): readonly { readonly workspaceId: string; readonly workspaceName: string; readonly timer: ProgressTimer; readonly characterName: string; }[] { return []; }
export function serializePlayerStore(state: PlayerStoreState): string { return JSON.stringify(state); }
export function parsePlayerStore(raw: string): PlayerStoreState | null { try { return JSON.parse(raw) as PlayerStoreState; } catch { return null; } }

export { characterClassLabels, equipmentSlots, slotLabels };
