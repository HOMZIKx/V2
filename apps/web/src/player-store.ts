/**
 * DESTILED first-player mock store (D-038–D-060 / D-061).
 * Shared in-browser state for Discord entry → workspace → character → EQ/timers/notes → history.
 * Not a production API. Persistence: localStorage only.
 */

import {
  characterClassLabels,
  getApprovedCharacterRender,
  type CharacterClass,
  type CharacterGender,
} from './character-profile';
import {
  equipmentSlots,
  slotLabels,
  type EquipmentAssignments,
  type EquipmentSlot,
} from './character-equipment';
import type { CatalogLayer } from './member-dashboard';
import type { TeamHistoryResource } from './team-history';

export type { CharacterClass, CharacterGender, EquipmentSlot };

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
  | 'ready'
  | 'available_elsewhere'
  | 'missing'
  | 'stale'
  | 'conflict'
  | 'planned';

export interface PlayerIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly discordDisplayName: string;
  readonly initials: string;
}

export interface WorkspaceMember {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly role: MembershipRole;
  readonly state: 'online' | 'away' | 'offline' | 'unknown';
}

export interface EquipmentItem {
  readonly id: string;
  readonly name: string;
  readonly iconPath: string;
  readonly category: EquipmentSlot;
  readonly levelLabel: string;
  readonly bonuses: readonly string[];
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
  readonly scope: 'workspace' | 'character';
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
  readonly members: readonly WorkspaceMember[];
  readonly characters: readonly CharacterRecord[];
  readonly items: readonly EquipmentItem[];
  readonly timers: readonly ProgressTimer[];
  readonly tasks: readonly TeamTask[];
  readonly notes: readonly WorkspaceNote[];
  readonly history: readonly HistoryEntry[];
  readonly invitations: readonly PendingInvitation[];
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

function isoInMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
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
  partial: Omit<HistoryEntry, 'id' | 'teamId' | 'actorId' | 'actorName' | 'actorInitials' | 'occurredAtLabel' | 'revision'> & {
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

export function buildDemoWorkspace(viewer: PlayerIdentity): WorkspaceRecord {
  const items: EquipmentItem[] = [
    {
      id: 'zodiac-sword',
      name: 'Zatruty Miecz +9',
      iconPath: '/game/items/zodiac-sword.svg',
      category: 'weapon',
      levelLabel: 'od poziomu 75',
      bonuses: ['Średnie obrażenia +37%', 'Silny przeciwko ludziom +10%', 'Witalność +12'],
      catalogLayer: 'team_private',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'XiaoHu',
      lastConfirmedAt: 'dzisiaj 22:41',
      archived: false,
      planned: false,
      revision: 3,
    },
    {
      id: 'short-knife',
      name: 'Krótki Nóż +9',
      iconPath: '/game/items/short-knife.svg',
      category: 'weapon',
      levelLabel: 'od poziomu 1',
      bonuses: ['Szybkość ataku +15%', 'Wartość ataku +18'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Aalpsik',
      lastConfirmedBy: 'Aalpsik',
      lastConfirmedAt: 'wczoraj 19:20',
      archived: false,
      planned: false,
      revision: 2,
    },
    {
      id: 'ivory-suit',
      name: 'Mglista Zbroja Płyt. +1',
      iconPath: '/game/items/ivory-suit.svg',
      category: 'armor',
      levelLabel: 'od poziomu 48',
      bonuses: ['Max PŻ +800', 'Odporność na magię 10%', 'Wartość ataku +50'],
      catalogLayer: 'team_private',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:05',
      archived: false,
      planned: false,
      revision: 2,
    },
    {
      id: 'battle-shield',
      name: 'Tarcza Bojowa +9',
      iconPath: '/game/items/battle-shield.svg',
      category: 'shield',
      levelLabel: 'od poziomu 21',
      bonuses: ['Odporność na omdlenie', 'Szansa na blok ciosu +10%'],
      catalogLayer: 'destiled_curated',
      lastConfirmedLocation: 'Aalpsik',
      lastConfirmedBy: 'Wicek',
      lastConfirmedAt: '2 dni temu',
      archived: false,
      planned: false,
      revision: 4,
    },
    {
      id: 'ebony-earrings',
      name: 'Ebonitowe Kolczyki +9',
      iconPath: '/game/items/ebony-earrings.svg',
      category: 'earrings',
      levelLabel: 'od poziomu 33',
      bonuses: ['Siła +12', 'Max PŻ +1650'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:06',
      archived: false,
      planned: false,
      revision: 1,
    },
    {
      id: 'jade-necklace',
      name: 'Jadeitowy Naszyjnik +9',
      iconPath: '/game/items/jade-necklace.svg',
      category: 'necklace',
      levelLabel: 'od poziomu 28',
      bonuses: ['Zręczność +12', 'Szybkość zaklęcia +20%'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:07',
      archived: false,
      planned: false,
      revision: 1,
    },
    {
      id: 'wooden-necklace',
      name: 'Drewniany Naszyjnik +9',
      iconPath: '/game/items/wooden-necklace.svg',
      category: 'necklace',
      levelLabel: 'od poziomu 1',
      bonuses: ['Szybkość zaklęcia +10%'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: null,
      lastConfirmedBy: null,
      lastConfirmedAt: null,
      archived: false,
      planned: true,
      revision: 1,
    },
    {
      id: 'wooden-bracelet',
      name: 'Drewniana Bransoleta +9',
      iconPath: '/game/items/wooden-bracelet.svg',
      category: 'bracelet',
      levelLabel: 'od poziomu 1',
      bonuses: ['Max PŻ +500'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:08',
      archived: false,
      planned: false,
      revision: 1,
    },
    {
      id: 'leather-boots',
      name: 'Skórzane Kozaki +8',
      iconPath: '/game/items/leather-boots.svg',
      category: 'shoes',
      levelLabel: 'od poziomu 29',
      bonuses: ['Szybkość ruchu +17%', 'Max PŻ +1000', 'Odporność na strzały +18%'],
      catalogLayer: 'team_private',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:09',
      archived: false,
      planned: false,
      revision: 1,
    },
  ];

  const warAssignments: EquipmentAssignments = {
    weapon: 'zodiac-sword',
    armor: 'ivory-suit',
    helmet: null,
    shield: 'battle-shield',
    earrings: 'ebony-earrings',
    necklace: 'jade-necklace',
    bracelet: 'wooden-bracelet',
    shoes: 'leather-boots',
  };

  const characters: CharacterRecord[] = [
    {
      id: 'nerwnicht',
      name: 'NerwNicht',
      characterClass: 'sura',
      gender: 'male',
      level: 75,
      responsibleMemberId: 'mateusz',
      note: 'Główna postać zespołu do prowadzenia setów na wojnę i dungeon.',
      imagePath: '/game/classes/sura-male.png',
      activeSetId: 'war',
      revision: 7,
      archived: false,
      sets: [
        { id: 'war', name: 'Wojna', description: 'Układ pod walkę z graczami', assignments: warAssignments },
        {
          id: 'dungeon',
          name: 'Dungeon',
          description: 'Roboczy układ pod PvM',
          assignments: { ...emptyAssignments(), weapon: 'short-knife', armor: 'ivory-suit', necklace: 'wooden-necklace', shoes: 'leather-boots' },
        },
        { id: 'empty', name: 'Nowy set', description: 'Pusty szablon do skopiowania', assignments: emptyAssignments() },
      ],
    },
    {
      id: 'aalpsik',
      name: 'Aalpsik',
      characterClass: 'ninja',
      gender: 'female',
      level: 55,
      responsibleMemberId: 'aalpsik',
      note: 'Postać zespołowa do dungeonów.',
      imagePath: '/game/classes/ninja-female.png',
      activeSetId: 'dungeon',
      revision: 4,
      archived: false,
      sets: [
        {
          id: 'dungeon',
          name: 'Dungeon',
          description: 'Układ dungeonowy',
          assignments: {
            ...emptyAssignments(),
            weapon: 'short-knife',
            armor: 'ivory-suit',
            shield: 'battle-shield',
            shoes: 'leather-boots',
          },
        },
      ],
    },
    {
      id: 'kimmizic',
      name: 'Kimmizic',
      characterClass: 'shaman',
      gender: 'male',
      level: 61,
      responsibleMemberId: 'wicek',
      note: 'Postać wsparcia zespołu.',
      imagePath: '/game/classes/shaman-male.png',
      activeSetId: 'support',
      revision: 3,
      archived: false,
      sets: [
        {
          id: 'support',
          name: 'Wsparcie',
          description: 'Układ wsparcia',
          assignments: { ...emptyAssignments(), necklace: 'jade-necklace', bracelet: 'wooden-bracelet', shoes: 'leather-boots' },
        },
      ],
    },
  ];

  return {
    id: 'asteria',
    name: 'Asteria',
    description: 'Wspólna przestrzeń postaci, ekwipunku i codziennych potwierdzeń zespołu.',
    revision: 19,
    updatedLabel: 'przed chwilą',
    members: [
      { id: 'mateusz', displayName: 'Mateusz', initials: 'M', role: 'owner', state: 'unknown' },
      { id: 'xiaohu', displayName: 'XiaoHu', initials: 'X', role: 'member', state: 'unknown' },
      { id: 'wicek', displayName: 'Wicek', initials: 'W', role: 'member', state: 'unknown' },
      { id: 'aalpsik', displayName: 'Aalpsik', initials: 'A', role: 'member', state: 'unknown' },
    ],
    characters,
    items,
    timers: [
      {
        id: 'skill-book-nerwnicht',
        characterId: 'nerwnicht',
        label: 'Księga umiejętności',
        detail: 'Smoczy Wir M8 → M9',
        status: 'running',
        readyAtIso: isoInMinutes(24),
        remainingLabel: 'za 24 min',
        progressPercent: 82,
        lastActorName: 'Mateusz',
        lastConfirmedAt: 'wczoraj 21:10',
        discordReminder: true,
        reminderState: 'unavailable',
        operationId: null,
      },
      {
        id: 'horse-medal-aalpsik',
        characterId: 'aalpsik',
        label: 'Medal konny',
        detail: 'Poziom konia 12 → 13',
        status: 'ready',
        readyAtIso: new Date().toISOString(),
        remainingLabel: 'gotowe teraz',
        progressPercent: 100,
        lastActorName: 'Aalpsik',
        lastConfirmedAt: 'dzisiaj 07:00',
        discordReminder: true,
        reminderState: 'unavailable',
        operationId: null,
      },
      {
        id: 'biologist-kimmizic',
        characterId: 'kimmizic',
        label: 'Biolog',
        detail: 'Pamiątki po demonie · 6/10',
        status: 'running',
        readyAtIso: isoInMinutes(60 * 14),
        remainingLabel: 'jutro 08:10',
        progressPercent: 41,
        lastActorName: 'Wicek',
        lastConfirmedAt: 'wczoraj 08:10',
        discordReminder: false,
        reminderState: 'off',
        operationId: null,
      },
    ],
    tasks: [
      {
        id: 'task-shield-location',
        title: 'Potwierdź lokalizację tarczy',
        detail: 'Ostatni zapis wskazuje postać Aalpsik. Sprawdź w grze i potwierdź ręcznie.',
        characterId: 'nerwnicht',
        characterName: 'NerwNicht',
        assigneeName: 'Mateusz',
        dueLabel: 'teraz',
        status: 'ready',
        source: 'equipment',
      },
      {
        id: 'task-horse-medal',
        title: 'Medal konny',
        detail: 'Timer minął. Po podpięciu bota przypomnienie trafi do przypisanej osoby na Discordzie.',
        characterId: 'aalpsik',
        characterName: 'Aalpsik',
        assigneeName: 'Aalpsik',
        dueLabel: 'gotowe',
        status: 'ready',
        source: 'timer',
      },
      {
        id: 'task-war-readiness',
        title: 'Sprawdź gotowość na wojnę',
        detail: 'Zespół potrzebuje potwierdzenia, czy zestaw Wojna jest dostępny na wieczór.',
        characterId: 'nerwnicht',
        characterName: 'NerwNicht',
        assigneeName: 'XiaoHu',
        dueLabel: 'dzisiaj 19:00',
        status: 'upcoming',
        source: 'team',
      },
    ],
    notes: [
      {
        id: 'note-war',
        scope: 'workspace',
        characterId: null,
        authorName: 'Mateusz',
        body: 'Na wojnę przygotować set pod ludzi. Tarcza musi wrócić na NerwNicht.',
        createdAtLabel: 'dzisiaj 09:42',
        revision: 1,
        pinned: true,
      },
      {
        id: 'note-alchemy',
        scope: 'workspace',
        characterId: null,
        authorName: 'XiaoHu',
        body: 'Alchemia dla Aalpsik jest w depo. Nie przenosiłem jej na inną postać.',
        createdAtLabel: 'wczoraj 23:18',
        revision: 1,
        pinned: false,
      },
    ],
    invitations: [],
    history: [
      historyEntry(viewer.id === 'mateusz' ? 'asteria' : 'asteria', viewer, {
        characterId: 'nerwnicht',
        characterName: 'NerwNicht',
        resource: 'equipment',
        title: 'Potwierdzono lokalizację tarczy',
        detail: 'Tarcza Bojowa +9 · poprzednio Aalpsik → obecnie Aalpsik (wymaga re-check)',
        revision: 19,
      }),
      {
        id: 'hist-book',
        teamId: 'asteria',
        actorId: 'mateusz',
        actorName: 'Mateusz',
        actorInitials: 'M',
        characterId: 'nerwnicht',
        characterName: 'NerwNicht',
        resource: 'timer',
        title: 'Rozpoczęto timer księgi',
        detail: 'Smoczy Wir M8 → M9',
        occurredAtLabel: 'wczoraj 21:10',
        revision: 18,
      },
    ],
  };
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
): PlayerStoreState {
  if (outcome === 'authenticated') {
    const viewer: PlayerIdentity = {
      id: 'mateusz',
      displayName: 'Mateusz',
      discordDisplayName: 'Mateusz',
      initials: 'M',
    };
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

export function cancelDiscordAuth(state: PlayerStoreState): PlayerStoreState {
  return { ...state, authStatus: 'cancelled', connection: 'offline' };
}

export function seedDemoData(state: PlayerStoreState): PlayerStoreState {
  if (!state.viewer) return state;
  const demo = buildDemoWorkspace(state.viewer);
  return {
    ...state,
    workspaces: [demo],
    seededDemo: true,
    lastOpenedWorkspaceId: demo.id,
    lastOpenedCharacterId: 'nerwnicht',
    pendingIncomingInvitations: [
      {
        id: 'invitation-mobbynzs',
        teamId: demo.id,
        teamName: demo.name,
        inviterName: 'Mateusz',
        recipientDiscordId: '994001220033445566',
        recipientDisplayName: 'MobbynZS Oak',
        status: 'pending',
        createdLabel: 'dzisiaj',
        expiresLabel: 'za 3 dni',
        revision: 1,
      },
    ],
  };
}

export function createWorkspace(state: PlayerStoreState, name: string): PlayerStoreState {
  if (!state.viewer) return state;
  const trimmed = name.trim();
  if (trimmed.length < 2) return state;
  const id = slugify(trimmed) || createId('ws');
  const workspace: WorkspaceRecord = {
    id,
    name: trimmed,
    description: 'Prywatna przestrzeń gracza. Solo działa na tym samym modelu co zespół.',
    members: [
      {
        id: state.viewer.id,
        displayName: state.viewer.displayName,
        initials: state.viewer.initials,
        role: 'owner',
        state: 'unknown',
      },
    ],
    characters: [],
    items: [],
    timers: [],
    tasks: [],
    notes: [],
    history: [
      historyEntry(id, state.viewer, {
        characterId: null,
        characterName: null,
        resource: 'member',
        title: 'Utworzono przestrzeń',
        detail: `Nazwa: ${trimmed}`,
        revision: 1,
      }),
    ],
    invitations: [],
    revision: 1,
    updatedLabel: nowLabel(),
  };

  return {
    ...state,
    workspaces: [...state.workspaces, workspace],
    lastOpenedWorkspaceId: id,
  };
}

export function touchLastOpened(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string | null,
): PlayerStoreState {
  return {
    ...state,
    lastOpenedWorkspaceId: workspaceId,
    lastOpenedCharacterId: characterId ?? state.lastOpenedCharacterId,
  };
}

function updateWorkspace(
  state: PlayerStoreState,
  workspaceId: string,
  updater: (workspace: WorkspaceRecord, viewer: PlayerIdentity) => WorkspaceRecord,
): PlayerStoreState {
  if (!state.viewer) return state;
  const viewer = state.viewer;
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? { ...updater(workspace, viewer), updatedLabel: nowLabel() }
        : workspace,
    ),
  };
}

export function createCharacter(
  state: PlayerStoreState,
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
): PlayerStoreState {
  const name = input.name.trim();
  if (name.length < 2) return state;
  const characterId = slugify(name) || createId('char');
  const setName = (input.startingSetName ?? 'Główny').trim() || 'Główny';
  const setId = slugify(setName) || 'main';
  const imagePath = getApprovedCharacterRender(input.characterClass, input.gender);

  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const character: CharacterRecord = {
      id: characterId,
      name,
      characterClass: input.characterClass,
      gender: input.gender,
      level: input.level,
      responsibleMemberId: input.responsibleMemberId || viewer.id,
      note: (input.note ?? '').trim(),
      imagePath,
      activeSetId: setId,
      revision: 1,
      archived: false,
      sets: [
        {
          id: setId,
          name: setName,
          description: 'Pusty zestaw startowy',
          assignments: emptyAssignments(),
        },
      ],
    };

    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters: [...workspace.characters, character],
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: name,
          resource: 'character',
          title: 'Utworzono postać',
          detail: `${characterClassLabels[input.characterClass]} · pusty zestaw „${setName}”`,
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function updateCharacter(
  state: PlayerStoreState,
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
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const characters = workspace.characters.map((character) => {
      if (character.id !== characterId) return character;
      return {
        ...character,
        name: input.name.trim(),
        characterClass: input.characterClass,
        gender: input.gender,
        level: input.level,
        responsibleMemberId: input.responsibleMemberId,
        note: (input.note ?? '').trim(),
        imagePath: getApprovedCharacterRender(input.characterClass, input.gender),
        revision: character.revision + 1,
      };
    });
    const updated = characters.find((character) => character.id === characterId);
    if (!updated) return workspace;
    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: updated.name,
          resource: 'character',
          title: 'Zaktualizowano profil postaci',
          detail: updated.note || 'Bez notatki',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function applyTaskOutcome(
  state: PlayerStoreState,
  workspaceId: string,
  taskId: string,
  outcome: TaskOutcome,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const tasks = workspace.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: outcome,
            dueLabel:
              outcome === 'done' ? 'potwierdzone' : outcome === 'snoozed' ? 'odłożone' : 'brak możliwości',
          }
        : task,
    );
    const task = workspace.tasks.find((entry) => entry.id === taskId);
    return {
      ...workspace,
      revision: workspace.revision + 1,
      tasks,
      history: task
        ? [
            historyEntry(workspace.id, viewer, {
              characterId: task.characterId,
              characterName: task.characterName,
              resource: task.source === 'timer' ? 'timer' : task.source === 'equipment' ? 'equipment' : 'note',
              title: `Akcja: ${task.title}`,
              detail:
                outcome === 'done' ? 'Zrobione' : outcome === 'snoozed' ? 'Później' : 'Nie mogę',
              revision: workspace.revision + 1,
            }),
            ...workspace.history,
          ]
        : workspace.history,
    };
  });
}

export function addWorkspaceNote(
  state: PlayerStoreState,
  workspaceId: string,
  body: string,
  characterId: string | null = null,
): PlayerStoreState {
  const trimmed = body.trim();
  if (!trimmed) return state;
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const note: WorkspaceNote = {
      id: createId('note'),
      scope: characterId ? 'character' : 'workspace',
      characterId,
      authorName: viewer.displayName,
      body: trimmed,
      createdAtLabel: nowLabel(),
      revision: 1,
      pinned: false,
    };
    return {
      ...workspace,
      revision: workspace.revision + 1,
      notes: [note, ...workspace.notes],
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: characterId
            ? workspace.characters.find((character) => character.id === characterId)?.name ?? null
            : null,
          resource: 'note',
          title: characterId ? 'Zapisano notatkę postaci' : 'Zapisano notatkę przestrzeni',
          detail: trimmed,
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function assignItemToSet(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string,
  setId: string,
  itemId: string,
  slot: EquipmentSlot,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const item = workspace.items.find((entry) => entry.id === itemId);
    if (!item || item.category !== slot) return workspace;
    const characters = workspace.characters.map((character) => {
      if (character.id !== characterId) return character;
      const sets = character.sets.map((set) => {
        if (set.id !== setId) return set;
        const assignments = { ...set.assignments };
        for (const key of equipmentSlots) {
          if (assignments[key] === itemId) assignments[key] = null;
        }
        assignments[slot] = itemId;
        return { ...set, assignments };
      });
      return { ...character, sets, revision: character.revision + 1 };
    });
    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: characters.find((character) => character.id === characterId)?.name ?? null,
          resource: 'equipment',
          title: `Zaplanowano ${item.name} na ${slotLabels[slot]}`,
          detail: 'Zmiana planu setu — to nie jest potwierdzenie lokalizacji w grze.',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function removeItemFromSet(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string,
  setId: string,
  slot: EquipmentSlot,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const characters = workspace.characters.map((character) => {
      if (character.id !== characterId) return character;
      const sets = character.sets.map((set) =>
        set.id === setId ? { ...set, assignments: { ...set.assignments, [slot]: null } } : set,
      );
      return { ...character, sets, revision: character.revision + 1 };
    });
    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: characters.find((character) => character.id === characterId)?.name ?? null,
          resource: 'equipment',
          title: `Usunięto plan ze slotu ${slotLabels[slot]}`,
          detail: 'Plan setu zaktualizowany.',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function confirmItemLocation(
  state: PlayerStoreState,
  workspaceId: string,
  itemId: string,
  locationLabel: string,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const items = workspace.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            lastConfirmedLocation: locationLabel,
            lastConfirmedBy: viewer.displayName,
            lastConfirmedAt: nowLabel(),
            revision: item.revision + 1,
            planned: false,
          }
        : item,
    );
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return workspace;
    return {
      ...workspace,
      revision: workspace.revision + 1,
      items,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: null,
          characterName: locationLabel,
          resource: 'equipment',
          title: `Potwierdzono lokalizację: ${item.name}`,
          detail: `Ostatnio potwierdzona lokalizacja: ${locationLabel}`,
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function markTimerDone(
  state: PlayerStoreState,
  workspaceId: string,
  timerId: string,
  operationId: string,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const existing = workspace.timers.find((timer) => timer.id === timerId);
    if (!existing) return workspace;
    if (existing.operationId === operationId && existing.status === 'running' && existing.progressPercent === 0) {
      return workspace;
    }
    const timers = workspace.timers.map((timer) =>
      timer.id === timerId
        ? {
            ...timer,
            status: 'running' as const,
            progressPercent: 0,
            remainingLabel: 'odliczanie rozpoczęte',
            readyAtIso: isoInMinutes(60),
            lastActorName: viewer.displayName,
            lastConfirmedAt: nowLabel(),
            operationId,
          }
        : timer,
    );
    return {
      ...workspace,
      revision: workspace.revision + 1,
      timers,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: existing.characterId,
          characterName:
            workspace.characters.find((character) => character.id === existing.characterId)?.name ??
            null,
          resource: 'timer',
          title: `Oznaczono wykonane: ${existing.label}`,
          detail: 'Timer zresetowany. Przypomnienie Discord niedostępne w podglądzie lokalnym.',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function createEquipmentItem(
  state: PlayerStoreState,
  workspaceId: string,
  input: {
    readonly name: string;
    readonly category: EquipmentSlot;
    readonly bonuses: readonly string[];
    readonly planned?: boolean;
  },
): PlayerStoreState {
  const name = input.name.trim();
  if (name.length < 2) return state;
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const item: EquipmentItem = {
      id: createId('item'),
      name,
      iconPath: '/game/items/short-knife.svg',
      category: input.category,
      levelLabel: 'własny wpis zespołu',
      bonuses: input.bonuses,
      catalogLayer: 'team_private',
      lastConfirmedLocation: null,
      lastConfirmedBy: null,
      lastConfirmedAt: null,
      archived: false,
      planned: input.planned ?? true,
      revision: 1,
    };
    return {
      ...workspace,
      revision: workspace.revision + 1,
      items: [item, ...workspace.items],
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: null,
          characterName: null,
          resource: 'equipment',
          title: `Utworzono przedmiot: ${name}`,
          detail: input.planned ? 'Oznaczony jako planowany' : 'Karta zespołu',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

export function acceptIncomingInvitation(
  state: PlayerStoreState,
  invitationId: string,
): PlayerStoreState {
  if (!state.viewer) return state;
  const invitation = state.pendingIncomingInvitations.find((entry) => entry.id === invitationId);
  // Also support accepting demo invitation routed by id even if seeded on workspace
  const workspaceInvite = state.workspaces
    .flatMap((workspace) => workspace.invitations.map((entry) => ({ workspace, entry })))
    .find(({ entry }) => entry.id === invitationId);

  if (invitation) {
    // External invite without local workspace — create membership into demo if matching asteria
    const existing = state.workspaces.find((workspace) => workspace.id === invitation.teamId);
    if (existing) {
      return {
        ...updateWorkspace(state, existing.id, (workspace, viewer) => ({
          ...workspace,
          revision: workspace.revision + 1,
          members: workspace.members.some((member) => member.id === viewer.id)
            ? workspace.members
            : [
                ...workspace.members,
                {
                  id: viewer.id,
                  displayName: viewer.displayName,
                  initials: viewer.initials,
                  role: 'member',
                  state: 'unknown',
                },
              ],
          invitations: workspace.invitations.map((entry) =>
            entry.id === invitationId ? { ...entry, status: 'accepted' as const } : entry,
          ),
          history: [
            historyEntry(workspace.id, viewer, {
              characterId: null,
              characterName: null,
              resource: 'member',
              title: 'Zaakceptowano zaproszenie',
              detail: viewer.displayName,
              revision: workspace.revision + 1,
            }),
            ...workspace.history,
          ],
        })),
        pendingIncomingInvitations: state.pendingIncomingInvitations.filter(
          (entry) => entry.id !== invitationId,
        ),
        lastOpenedWorkspaceId: existing.id,
      };
    }
  }

  if (workspaceInvite) {
    return {
      ...updateWorkspace(state, workspaceInvite.workspace.id, (workspace, viewer) => ({
        ...workspace,
        revision: workspace.revision + 1,
        invitations: workspace.invitations.map((entry) =>
          entry.id === invitationId ? { ...entry, status: 'accepted' as const } : entry,
        ),
        history: [
          historyEntry(workspace.id, viewer, {
            characterId: null,
            characterName: null,
            resource: 'member',
            title: 'Zaproszenie zaakceptowane przez odbiorcę',
            detail: workspaceInvite.entry.recipientDisplayName,
            revision: workspace.revision + 1,
          }),
          ...workspace.history,
        ],
      })),
      lastOpenedWorkspaceId: workspaceInvite.workspace.id,
    };
  }

  // Fallback for e2e invitation page: treat as accepted and ensure asteria exists
  let next = state.seededDemo || state.workspaces.some((workspace) => workspace.id === 'asteria')
    ? state
    : seedDemoData(state);
  if (!next.viewer) return next;
  return {
    ...next,
    lastOpenedWorkspaceId: 'asteria',
  };
}

export function getWorkspace(
  state: PlayerStoreState,
  workspaceId: string,
): WorkspaceRecord | null {
  return state.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

export function getCharacter(
  workspace: WorkspaceRecord,
  characterId: string,
): CharacterRecord | null {
  return workspace.characters.find((character) => character.id === characterId) ?? null;
}

export function getSlotReadiness(
  workspace: WorkspaceRecord,
  character: CharacterRecord,
  set: EquipmentSet,
  slot: EquipmentSlot,
): SetReadiness {
  const expectedId = set.assignments[slot];
  if (!expectedId) return 'missing';
  const item = workspace.items.find((entry) => entry.id === expectedId);
  if (!item) return 'missing';
  if (item.planned) return 'planned';
  if (!item.lastConfirmedLocation) return 'missing';
  if (item.lastConfirmedLocation !== character.name) return 'available_elsewhere';
  if (item.lastConfirmedAt && item.lastConfirmedAt.includes('2 dni')) return 'stale';
  const conflict = character.sets.some(
    (other) =>
      other.id !== set.id &&
      equipmentSlots.some((otherSlot) => other.assignments[otherSlot] === expectedId),
  );
  if (conflict) return 'conflict';
  return 'ready';
}

export function getReadyTimers(state: PlayerStoreState): readonly {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly timer: ProgressTimer;
  readonly characterName: string;
}[] {
  return state.workspaces.flatMap((workspace) =>
    workspace.timers
      .filter((timer) => timer.status === 'ready')
      .map((timer) => ({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        timer,
        characterName:
          workspace.characters.find((character) => character.id === timer.characterId)?.name ??
          'Postać',
      })),
  );
}

export function serializePlayerStore(state: PlayerStoreState): string {
  return JSON.stringify(state);
}

export function parsePlayerStore(raw: string): PlayerStoreState | null {
  try {
    const parsed = JSON.parse(raw) as PlayerStoreState;
    if (!parsed || typeof parsed !== 'object' || !parsed.authStatus) return null;
    return parsed;
  } catch {
    return null;
  }
}

export { characterClassLabels, slotLabels, equipmentSlots };
