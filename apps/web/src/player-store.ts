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
  getApprovedCharacterRender,
  type CharacterClass,
  type CharacterGender,
} from './character-profile';
import {
  clampEnhancement,
  equipmentSlotForCategory,
  findGameItemByCardName,
  formatEnhancedItemName,
  isItemCompatibleWithClass,
  parseEnhancementFromName,
  resolveItemBonuses,
  resolveItemIconPath,
  stripEnhancementFromName,
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

export type { CharacterClass, CharacterGender, EquipmentSlot, ProgressionKind };

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
  /** Enhancement level shown on the card (+0 … +9). */
  readonly enhancement: number;
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
  /** Project Hard progression family when known. */
  readonly kind?: ProgressionKind;
  /** Illustration matching the cycle (book / soul stone / biologist / horse medal). */
  readonly iconPath?: string;
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
  partial: Omit<EquipmentItem, 'iconPath' | 'name' | 'enhancement' | 'bonuses'> & {
    readonly baseName: string;
    readonly enhancement: number;
    readonly bonuses?: readonly string[];
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
    catalogLayer: partial.catalogLayer,
    lastConfirmedLocation: partial.lastConfirmedLocation,
    lastConfirmedBy: partial.lastConfirmedBy,
    lastConfirmedAt: partial.lastConfirmedAt,
    archived: partial.archived,
    planned: partial.planned,
    revision: partial.revision,
    iconPath: partial.iconPath ?? resolveItemIconPath(name),
  };
}

export function buildDemoWorkspace(viewer: PlayerIdentity): WorkspaceRecord {
  const midnight = nextMidnightLabel();
  const iceQuest = biologistQuestById('dull-ice')!;

  // Class-correct cards from wiki/PH categories. Unique IDs per character so shared
  // readiness conflicts are intentional only when the team truly shares one card.
  const items: EquipmentItem[] = [
    demoEquipmentItem({
      id: 'sura-sword',
      baseName: 'Demoniczne Ostrze',
      enhancement: 9,
      category: 'weapon',
      levelLabel: 'katalog: Sura — broń jednoręczna (tylko Sura)',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'XiaoHu',
      lastConfirmedAt: 'dzisiaj 22:41',
      archived: false,
      planned: false,
      revision: 3,
    }),
    demoEquipmentItem({
      id: 'sura-sword-dungeon',
      baseName: 'Lwi Miecz',
      enhancement: 6,
      category: 'weapon',
      levelLabel: 'katalog: Sura — broń jednoręczna (tylko Sura)',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 12:00',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'sura-shared-sword',
      baseName: 'Zatruty Miecz',
      enhancement: 8,
      category: 'weapon',
      levelLabel: 'katalog: miecz wspólny (Wojownik / Ninja / Sura)',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 12:10',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'sura-armor',
      baseName: 'Mglista Zbroja Płytowa',
      enhancement: 9,
      category: 'armor',
      levelLabel: 'katalog: Sura — zbroje',
      bonuses: ['Max PŻ +800', 'Odporność na magię 10%', 'Wartość ataku +50'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:05',
      archived: false,
      planned: false,
      revision: 2,
    }),
    demoEquipmentItem({
      id: 'sura-helmet',
      baseName: 'Krwawy Hełm',
      enhancement: 9,
      category: 'helmet',
      levelLabel: 'katalog: Sura — hełmy',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:05',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'sura-shield',
      baseName: 'Bojowa Tarcza',
      enhancement: 9,
      category: 'shield',
      levelLabel: 'katalog: Tarcze (wszystkie klasy)',
      bonuses: ['Odporność na omdlenie', 'Szansa na blok ciosu +10%'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:10',
      archived: false,
      planned: false,
      revision: 4,
    }),
    demoEquipmentItem({
      id: 'sura-earrings',
      baseName: 'Ebonitowe Kolczyki',
      enhancement: 9,
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
    }),
    demoEquipmentItem({
      id: 'sura-necklace',
      baseName: 'Jadeitowy Naszyjnik',
      enhancement: 9,
      category: 'necklace',
      levelLabel: 'od poziomu 42',
      bonuses: ['Szybkość zaklęcia +22%', 'Zręczność +4'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:07',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'sura-bracelet',
      baseName: 'Drewniana Bransoleta',
      enhancement: 9,
      category: 'bracelet',
      levelLabel: 'od poziomu 0',
      bonuses: ['Szybkość ataku +5%', 'Czas trwania umiejętności +20 s'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:08',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'sura-boots',
      baseName: 'Skórzane Kozaki',
      enhancement: 9,
      category: 'shoes',
      levelLabel: 'od poziomu 29',
      bonuses: ['Szybkość ruchu +20%', 'Odporność na strzały +20%'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'NerwNicht',
      lastConfirmedBy: 'Mateusz',
      lastConfirmedAt: 'dzisiaj 18:09',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'ninja-knife',
      baseName: 'Krótki Nóż',
      enhancement: 9,
      category: 'weapon',
      levelLabel: 'katalog: Ninja — sztylety',
      bonuses: ['Szybkość ataku +15%', 'Wartość ataku +18'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Aalpsik',
      lastConfirmedBy: 'Aalpsik',
      lastConfirmedAt: 'wczoraj 19:20',
      archived: false,
      planned: false,
      revision: 2,
    }),
    demoEquipmentItem({
      id: 'ninja-helmet',
      baseName: 'Pajęczy Kaptur',
      enhancement: 7,
      category: 'helmet',
      levelLabel: 'katalog: Ninja — hełmy',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Aalpsik',
      lastConfirmedBy: 'Aalpsik',
      lastConfirmedAt: 'wczoraj 19:21',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'ninja-earrings',
      baseName: 'Drewniane Kolczyki',
      enhancement: 6,
      category: 'earrings',
      levelLabel: 'katalog: Kolczyki',
      bonuses: ['Zręczność'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Aalpsik',
      lastConfirmedBy: 'Aalpsik',
      lastConfirmedAt: 'wczoraj 19:22',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'ninja-boots',
      baseName: 'Bambusowe Buty',
      enhancement: 5,
      category: 'shoes',
      levelLabel: 'katalog: Buty',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Aalpsik',
      lastConfirmedBy: 'Aalpsik',
      lastConfirmedAt: 'wczoraj 19:23',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'shaman-bell',
      baseName: 'Antyczny Dzwon',
      enhancement: 9,
      category: 'weapon',
      levelLabel: 'katalog: Szaman — dzwony',
      bonuses: ['Siła magii'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Kimmizic',
      lastConfirmedBy: 'Wicek',
      lastConfirmedAt: 'wczoraj 20:00',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'shaman-robe',
      baseName: 'Błękitna Szata',
      enhancement: 8,
      category: 'armor',
      levelLabel: 'katalog: Szaman — zbroje',
      bonuses: ['Max SP', 'Obrona'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Kimmizic',
      lastConfirmedBy: 'Wicek',
      lastConfirmedAt: 'wczoraj 20:01',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'shaman-hat',
      baseName: 'Czapka Feniksa',
      enhancement: 4,
      category: 'helmet',
      levelLabel: 'katalog: Szaman — hełmy',
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Kimmizic',
      lastConfirmedBy: 'Wicek',
      lastConfirmedAt: 'wczoraj 20:02',
      archived: false,
      planned: false,
      revision: 1,
    }),
    demoEquipmentItem({
      id: 'shaman-necklace',
      baseName: 'Drewniany Naszyjnik',
      enhancement: 3,
      category: 'necklace',
      levelLabel: 'katalog: Naszyjniki',
      bonuses: ['Szybkość zaklęcia +10%'],
      catalogLayer: 'project_hard_source',
      lastConfirmedLocation: 'Kimmizic',
      lastConfirmedBy: 'Wicek',
      lastConfirmedAt: 'wczoraj 20:03',
      archived: false,
      planned: true,
      revision: 1,
    }),
  ];

  const warAssignments: EquipmentAssignments = {
    weapon: 'sura-sword',
    armor: 'sura-armor',
    helmet: 'sura-helmet',
    shield: 'sura-shield',
    earrings: 'sura-earrings',
    necklace: 'sura-necklace',
    bracelet: 'sura-bracelet',
    shoes: 'sura-boots',
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
        {
          id: 'war',
          name: 'Wojna',
          description: 'Układ pod walkę z graczami',
          assignments: warAssignments,
        },
        {
          id: 'dungeon',
          name: 'Loch',
          description: 'Roboczy układ pod PvM (bez sztyletów — to broń Ninji)',
          assignments: {
            ...emptyAssignments(),
            weapon: 'sura-sword-dungeon',
          },
        },
        {
          id: 'empty',
          name: 'Szablon',
          description: 'Pusty szablon do skopiowania',
          assignments: emptyAssignments(),
        },
      ],
    },
    {
      id: 'aalpsik',
      name: 'Aalpsik',
      characterClass: 'ninja',
      gender: 'female',
      level: 55,
      responsibleMemberId: 'aalpsik',
      note: 'Postać zespołowa do dungeonów. Zbroja Ninja nie ma wpisu w obecnym katalogu wiki — slot zostawiony pusty.',
      imagePath: '/game/classes/ninja-female.png',
      activeSetId: 'dungeon',
      revision: 4,
      archived: false,
      sets: [
        {
          id: 'dungeon',
          name: 'Loch',
          description: 'Układ lochowy (sztylet + hełm Ninja)',
          assignments: {
            ...emptyAssignments(),
            weapon: 'ninja-knife',
            helmet: 'ninja-helmet',
            earrings: 'ninja-earrings',
            shoes: 'ninja-boots',
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
          description: 'Układ wsparcia (dzwon + szata Szamana)',
          assignments: {
            ...emptyAssignments(),
            weapon: 'shaman-bell',
            armor: 'shaman-robe',
            helmet: 'shaman-hat',
            necklace: 'shaman-necklace',
          },
        },
      ],
    },
    {
      id: 'xiaohu',
      name: 'XiaoHu',
      characterClass: 'warrior',
      gender: 'male',
      level: 68,
      responsibleMemberId: 'xiaohu',
      note: 'Wojownik zespołu — wspólny miecz jednoręczny (Wojownik/Ninja/Sura).',
      imagePath: '/game/classes/warrior-male.png',
      activeSetId: 'war',
      revision: 2,
      archived: false,
      sets: [
        {
          id: 'war',
          name: 'Wojna',
          description: 'Układ PvP Wojownika',
          assignments: {
            ...emptyAssignments(),
            weapon: 'sura-shared-sword',
          },
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
    timers: characters.flatMap((character) => {
      const base = defaultProgressionTimers(character.id, character.level);
      const withStableIds = (timers: readonly ProgressTimer[]): ProgressTimer[] =>
        timers.map((timer) => ({
          ...timer,
          id: `${timer.kind}-${character.id}`,
        }));

      // Keep a couple of lived-in demo states so the board is not all "ready".
      if (character.id === 'nerwnicht') {
        return withStableIds(base).map((timer) => {
          if (timer.kind === 'skill_book') {
            return {
              ...timer,
              detail: 'Smoczy Wir M8 → M9 · limit czytań resetuje się o północy',
              status: 'running' as const,
              readyAtIso: nextMidnightIso(),
              remainingLabel: `do ${midnight}`,
              progressPercent: 82,
              lastActorName: 'Mateusz',
              lastConfirmedAt: 'wczoraj 21:10',
            };
          }
          if (timer.kind === 'soul_stone') {
            return {
              ...timer,
              detail: 'Błyskawica P · mistrzostwo pasywne · limit czytań resetuje się o północy',
              status: 'ready' as const,
              remainingLabel: 'gotowe do czytania',
              progressPercent: 100,
              lastActorName: 'Mateusz',
              lastConfirmedAt: 'wczoraj 19:40',
            };
          }
          if (timer.kind === 'leadership') {
            return {
              ...timer,
              detail: 'Wu Zi M6 → M7 · Dowodzenie · limit czytań resetuje się o północy',
              status: 'running' as const,
              readyAtIso: nextMidnightIso(),
              remainingLabel: `do ${midnight}`,
              progressPercent: 48,
              lastActorName: 'Mateusz',
              lastConfirmedAt: 'wczoraj 20:15',
            };
          }
          if (timer.kind === 'polymorph') {
            return {
              ...timer,
              detail: 'Zaaw. Księga Polimorfii · M3 · limit czytań resetuje się o północy',
            };
          }
          if (timer.kind === 'mining') {
            return {
              ...timer,
              detail: 'Przewodnik do górnictwa · poziom 7 · limit czytań resetuje się o północy',
              status: 'ready' as const,
              remainingLabel: 'gotowe do czytania',
              progressPercent: 100,
            };
          }
          if (timer.kind === 'biologist') {
            return {
              ...timer,
              detail: `${biologistProgressLabel(biologistQuestForLevel(75)!, 12)} · cooldown po każdej próbie · reset o północy`,
              status: 'running' as const,
              readyAtIso: nextMidnightIso(),
              remainingLabel: `do ${midnight}`,
              progressPercent: 55,
              lastActorName: 'Mateusz',
              lastConfirmedAt: 'wczoraj 22:40',
            };
          }
          return {
            ...timer,
            detail: `${horseAdvanceDetail(20, 21)} · u Stajennego`,
          };
        });
      }
      if (character.id === 'aalpsik') {
        return withStableIds(base).map((timer) => {
          if (timer.kind === 'horse') {
            return {
              ...timer,
              detail: `${horseAdvanceDetail(12, 13)} · u Stajennego`,
              status: 'ready' as const,
              remainingLabel: 'gotowe do oddania',
              progressPercent: 100,
              lastActorName: 'Aalpsik',
              lastConfirmedAt: 'dzisiaj 07:00',
            };
          }
          if (timer.kind === 'biologist') {
            return {
              ...timer,
              detail: `${biologistProgressLabel(biologistQuestById('demon-keepsake')!, 9)} · cooldown tylko po udanym oddaniu · reset o północy`,
            };
          }
          if (timer.kind === 'soul_stone') {
            return {
              ...timer,
              detail: 'Aura Miecza P · mistrzostwo pasywne · limit czytań resetuje się o północy',
              status: 'running' as const,
              readyAtIso: nextMidnightIso(),
              remainingLabel: `do ${midnight}`,
              progressPercent: 64,
              lastActorName: 'Aalpsik',
              lastConfirmedAt: 'wczoraj 23:05',
            };
          }
          if (timer.kind === 'leadership') {
            return {
              ...timer,
              detail: 'Sun Zi 14/20 · Dowodzenie · limit czytań resetuje się o północy',
            };
          }
          return timer;
        });
      }
      if (character.id === 'kimmizic') {
        return withStableIds(base).map((timer) => {
          if (timer.kind === 'biologist') {
            return {
              ...timer,
              detail: `${biologistProgressLabel(iceQuest, 4)} · cooldown po każdej próbie · reset o północy`,
              status: 'running' as const,
              readyAtIso: nextMidnightIso(),
              remainingLabel: `do ${midnight}`,
              progressPercent: 41,
              lastActorName: 'Wicek',
              lastConfirmedAt: 'wczoraj 08:10',
              discordReminder: false,
              reminderState: 'off' as const,
            };
          }
          if (timer.kind === 'polymorph') {
            return {
              ...timer,
              detail: 'Księga Polimorfii · 11/20 · limit czytań resetuje się o północy',
              status: 'running' as const,
              readyAtIso: nextMidnightIso(),
              remainingLabel: `do ${midnight}`,
              progressPercent: 37,
              lastActorName: 'Wicek',
              lastConfirmedAt: 'wczoraj 11:20',
            };
          }
          if (timer.kind === 'mining') {
            return {
              ...timer,
              detail: 'Przewodnik do górnictwa · poziom 4 · limit czytań resetuje się o północy',
            };
          }
          return timer;
        });
      }
      return withStableIds(base);
    }),
    tasks: [
      {
        id: 'task-shield-location',
        title: 'Potwierdź lokalizację tarczy',
        detail:
          'Ostatni zapis wskazuje NerwNicht. Sprawdź w grze, czy Bojowa Tarcza nadal tam leży.',
        characterId: 'nerwnicht',
        characterName: 'NerwNicht',
        assigneeName: 'Mateusz',
        dueLabel: 'teraz',
        status: 'ready',
        source: 'equipment',
      },
      {
        id: 'task-horse-medal',
        title: 'Jazda konna gotowa',
        detail: `Aalpsik może oddać materiał u Stajennego. Następny awans: cooldown ${projectHardHorseRules.advancementCooldownHours} h.`,
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
        body: 'Na wojnę: set Surą. Bojowa Tarcza zostaje na NerwNicht.',
        createdAtLabel: 'dzisiaj 09:42',
        revision: 1,
        pinned: true,
      },
      {
        id: 'note-depo',
        scope: 'workspace',
        characterId: null,
        authorName: 'XiaoHu',
        body: 'Medale Konne i Zwoje Błogosławieństwa Aalpsik leżą w depo. Nie przenosiłem ich na inną postać.',
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
        detail: 'Bojowa Tarcza +9 · potwierdzona na NerwNicht',
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
        detail: 'Smoczy Wir M8 → M9 · limit dzienny resetuje się o północy',
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

export function seedDemoData(
  state: PlayerStoreState,
  options: { readonly replace?: boolean } = {},
): PlayerStoreState {
  if (!state.viewer) return state;
  const demo = buildDemoWorkspace(state.viewer);
  const demoInvite: PendingInvitation = {
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
  };
  const demoWithOutgoing: WorkspaceRecord = {
    ...demo,
    invitations: [demoInvite, ...demo.invitations.filter((entry) => entry.id !== demoInvite.id)],
  };

  const replace = options.replace === true || state.workspaces.length === 0;
  const workspaces = replace
    ? [demoWithOutgoing]
    : [
        demoWithOutgoing,
        ...state.workspaces.filter((workspace) => workspace.id !== demoWithOutgoing.id),
      ];

  // Outgoing demo invite must not pollute Mateusz's incoming inbox.
  return {
    ...state,
    workspaces,
    seededDemo: true,
    lastOpenedWorkspaceId: demoWithOutgoing.id,
    lastOpenedCharacterId: 'nerwnicht',
    pendingIncomingInvitations: state.pendingIncomingInvitations.filter(
      (entry) => entry.id !== demoInvite.id,
    ),
  };
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
  if (!state.viewer) return state;
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) return state;

  const existing = workspace.invitations.find(
    (entry) => entry.recipientDiscordId === recipient.discordUserId && entry.status === 'pending',
  );
  if (existing) return state;

  const invitation: PendingInvitation = {
    id: createId('inv'),
    teamId: workspace.id,
    teamName: workspace.name,
    inviterName: state.viewer.displayName,
    recipientDiscordId: recipient.discordUserId,
    recipientDisplayName: recipient.displayName,
    status: 'pending',
    createdLabel: nowLabel(),
    expiresLabel: 'za 3 dni',
    revision: 1,
  };

  const withWorkspace = updateWorkspace(state, workspaceId, (current, viewer) => ({
    ...current,
    revision: current.revision + 1,
    invitations: [invitation, ...current.invitations],
    history: [
      historyEntry(current.id, viewer, {
        characterId: null,
        characterName: null,
        resource: 'member',
        title: `Wysłano zaproszenie: ${recipient.displayName}`,
        detail: `Discord ID ${recipient.discordUserId}`,
        revision: current.revision + 1,
      }),
      ...current.history,
    ],
  }));

  // Outgoing invites stay on the workspace list — never in the viewer's inbox.
  return withWorkspace;
}

export function findInvitation(
  state: PlayerStoreState,
  invitationId: string,
): PendingInvitation | null {
  const fromPending =
    state.pendingIncomingInvitations.find((entry) => entry.id === invitationId) ?? null;
  if (fromPending) return fromPending;
  for (const workspace of state.workspaces) {
    const hit = workspace.invitations.find((entry) => entry.id === invitationId);
    if (hit) return hit;
  }
  return null;
}

export function declineIncomingInvitation(
  state: PlayerStoreState,
  invitationId: string,
): PlayerStoreState {
  const invitation = findInvitation(state, invitationId);
  if (!invitation || invitation.status !== 'pending') return state;

  return {
    ...state,
    pendingIncomingInvitations: state.pendingIncomingInvitations.filter(
      (entry) => entry.id !== invitationId,
    ),
    workspaces: state.workspaces.map((workspace) => {
      if (workspace.id !== invitation.teamId) return workspace;
      return {
        ...workspace,
        invitations: workspace.invitations.map((entry) =>
          entry.id === invitationId ? { ...entry, status: 'declined' as const } : entry,
        ),
      };
    }),
  };
}

export function createWorkspace(state: PlayerStoreState, name: string): PlayerStoreState {
  if (!state.viewer) return state;
  const trimmed = name.trim();
  if (trimmed.length < 2) return state;
  const taken = new Set(state.workspaces.map((workspace) => workspace.id));
  const id = uniqueSlug(trimmed, taken);
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

export function ensureCharacterProgressionTimers(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string,
): PlayerStoreState {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) return state;
  const character = workspace.characters.find((entry) => entry.id === characterId);
  if (!character) return state;

  let iconBackfill = false;
  const withIcons = workspace.timers.map((timer) => {
    if (timer.characterId !== characterId) return timer;
    const kind = timer.kind ?? inferProgressionKind(timer.label);
    if (!kind) return timer;
    const iconPath = progressionTimerIcons[kind];
    const label = progressionTimerLabels[kind];
    if (timer.kind === kind && timer.iconPath === iconPath && timer.label === label) {
      return timer;
    }
    iconBackfill = true;
    return { ...timer, kind, iconPath, label };
  });

  const existingKinds = new Set(
    withIcons
      .filter((timer) => timer.characterId === characterId)
      .map((timer) => timer.kind ?? inferProgressionKind(timer.label))
      .filter((kind): kind is ProgressionKind => kind !== null),
  );
  const missing = progressionKindsForLevel(character.level).filter(
    (kind) => !existingKinds.has(kind),
  );
  if (missing.length === 0 && !iconBackfill) return state;

  const added = missing.map((kind) => buildProgressionTimer(characterId, kind, character.level));
  const historyTitle =
    missing.length > 0 ? 'Uzupełniono cykle Projekt Hard' : 'Odświeżono ilustracje cykli PH';
  const historyDetail =
    missing.length > 0
      ? added.map((timer) => timer.label).join(' · ')
      : 'Księgi / Kamienie / Dowodzenie / Polimorfia / Górnictwo / Combo / Jazda / Biolog';

  return updateWorkspace(state, workspaceId, (current, viewer) => ({
    ...current,
    revision: current.revision + 1,
    timers: [...added, ...withIcons],
    history: [
      historyEntry(current.id, viewer, {
        characterId,
        characterName: character.name,
        resource: 'timer',
        title: historyTitle,
        detail: historyDetail,
        revision: current.revision + 1,
      }),
      ...current.history,
    ],
  }));
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

  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const taken = new Set(workspace.characters.map((character) => character.id));
    const characterId = uniqueSlug(name, taken);
    const setName = (input.startingSetName ?? 'Główny').trim() || 'Główny';
    const setId = slugify(setName) || 'main';
    const imagePath = getApprovedCharacterRender(input.characterClass, input.gender);
    const level =
      input.level !== null && input.level > projectHardProductFacts.maxCharacterLevel
        ? projectHardProductFacts.maxCharacterLevel
        : input.level;

    const character: CharacterRecord = {
      id: characterId,
      name,
      characterClass: input.characterClass,
      gender: input.gender,
      level,
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
      timers: [...defaultProgressionTimers(characterId, level), ...workspace.timers],
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: name,
          resource: 'character',
          title: 'Utworzono postać',
          detail: `${characterClassLabels[input.characterClass]} · pusty zestaw „${setName}” · timery PH startowe`,
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
              outcome === 'done'
                ? 'potwierdzone'
                : outcome === 'snoozed'
                  ? 'odłożone'
                  : 'brak możliwości',
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
              resource:
                task.source === 'timer'
                  ? 'timer'
                  : task.source === 'equipment'
                    ? 'equipment'
                    : 'note',
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
            ? (workspace.characters.find((character) => character.id === characterId)?.name ?? null)
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
    const character = workspace.characters.find((entry) => entry.id === characterId);
    if (!item || !character || item.category !== slot) return workspace;

    const catalogHit = findGameItemByCardName(item.name);
    if (catalogHit) {
      const catalogSlot = equipmentSlotForCategory(catalogHit.category);
      if (catalogSlot === null || catalogSlot !== slot) return workspace;
      if (!isItemCompatibleWithClass(catalogHit.category, character.characterClass)) {
        return workspace;
      }
    }

    const characters = workspace.characters.map((entry) => {
      if (entry.id !== characterId) return entry;
      const sets = entry.sets.map((set) => {
        if (set.id !== setId) return set;
        const assignments = { ...set.assignments };
        for (const key of equipmentSlots) {
          if (assignments[key] === itemId) assignments[key] = null;
        }
        assignments[slot] = itemId;
        return { ...set, assignments };
      });
      return { ...entry, sets, revision: entry.revision + 1 };
    });
    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: characters.find((entry) => entry.id === characterId)?.name ?? null,
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
    const matchedCharacter =
      workspace.characters.find(
        (character) =>
          character.name.toLocaleLowerCase('pl') === locationLabel.toLocaleLowerCase('pl'),
      ) ?? null;
    return {
      ...workspace,
      revision: workspace.revision + 1,
      items,
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: matchedCharacter?.id ?? null,
          characterName: matchedCharacter?.name ?? null,
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

export function setActiveCharacterSet(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string,
  setId: string,
): PlayerStoreState {
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const character = workspace.characters.find((entry) => entry.id === characterId);
    if (!character || !character.sets.some((entry) => entry.id === setId)) return workspace;
    if (character.activeSetId === setId) return workspace;
    const setName = character.sets.find((entry) => entry.id === setId)?.name ?? setId;
    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters: workspace.characters.map((entry) =>
        entry.id === characterId
          ? { ...entry, activeSetId: setId, revision: entry.revision + 1 }
          : entry,
      ),
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: character.name,
          resource: 'equipment',
          title: `Aktywny set: ${setName}`,
          detail: 'Przełączono aktywny układ ekwipunku.',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

/** Add another named equipment set after character creation (was missing — only starter set existed). */
export function createEquipmentSet(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string,
  input: {
    readonly name: string;
    readonly description?: string;
    readonly makeActive?: boolean;
  },
): { readonly state: PlayerStoreState; readonly setId: string | null } {
  const name = input.name.trim();
  if (name.length < 2) return { state, setId: null };

  let createdSetId: string | null = null;
  const next = updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const character = workspace.characters.find((entry) => entry.id === characterId);
    if (!character) return workspace;

    const taken = new Set(character.sets.map((set) => set.id));
    const setId = uniqueSlug(name, taken);
    createdSetId = setId;
    const description = (input.description ?? '').trim() || `Zestaw „${name}”`;
    const makeActive = input.makeActive !== false;

    return {
      ...workspace,
      revision: workspace.revision + 1,
      characters: workspace.characters.map((entry) =>
        entry.id === characterId
          ? {
              ...entry,
              activeSetId: makeActive ? setId : entry.activeSetId,
              revision: entry.revision + 1,
              sets: [
                ...entry.sets,
                {
                  id: setId,
                  name,
                  description,
                  assignments: emptyAssignments(),
                },
              ],
            }
          : entry,
      ),
      history: [
        historyEntry(workspace.id, viewer, {
          characterId,
          characterName: character.name,
          resource: 'equipment',
          title: `Dodano set „${name}”`,
          detail: makeActive ? 'Pusty zestaw · ustawiony jako aktywny' : 'Pusty zestaw',
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });

  return { state: next, setId: createdSetId };
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
    if (existing.status !== 'ready') return workspace;
    const kind = existing.kind ?? inferProgressionKind(existing.label);
    const restart = restartAfterDone(kind);
    const timers = workspace.timers.map((timer) => {
      if (timer.id !== timerId) return timer;
      return {
        ...timer,
        ...(kind ? { kind } : {}),
        status: 'running' as const,
        progressPercent: 0,
        remainingLabel: restart.remainingLabel,
        readyAtIso: restart.readyAtIso,
        lastActorName: viewer.displayName,
        lastConfirmedAt: nowLabel(),
        operationId,
      };
    });
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
          detail: `${restart.detailHint} Przypomnienie Discord niedostępne w podglądzie lokalnym.`,
          revision: workspace.revision + 1,
        }),
        ...workspace.history,
      ],
    };
  });
}

/** Add a missing Project Hard cycle (or custom label) on a character card. */
export function addProgressionTimer(
  state: PlayerStoreState,
  workspaceId: string,
  characterId: string,
  input: { readonly kind?: ProgressionKind; readonly label?: string },
): PlayerStoreState {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) return state;
  const character = workspace.characters.find((entry) => entry.id === characterId);
  if (!character) return state;

  if (input.kind) {
    const already = workspace.timers.some(
      (timer) =>
        timer.characterId === characterId &&
        (timer.kind ?? inferProgressionKind(timer.label)) === input.kind,
    );
    if (already) return state;
    const timer = buildProgressionTimer(characterId, input.kind, character.level);
    return updateWorkspace(state, workspaceId, (current, viewer) => ({
      ...current,
      revision: current.revision + 1,
      timers: [timer, ...current.timers],
      history: [
        historyEntry(current.id, viewer, {
          characterId,
          characterName: character.name,
          resource: 'timer',
          title: `Dodano timer: ${timer.label}`,
          detail: 'Cykl Projekt Hard na karcie postaci',
          revision: current.revision + 1,
        }),
        ...current.history,
      ],
    }));
  }

  const label = input.label?.trim() ?? '';
  if (label.length < 2) return state;
  const timer: ProgressTimer = {
    id: createId('timer-custom'),
    characterId,
    label,
    detail: 'Timer ręczny zespołu · kliknij, gdy gotowy, aby uruchomić cykl',
    status: 'ready',
    readyAtIso: new Date().toISOString(),
    remainingLabel: 'gotowe',
    progressPercent: 100,
    lastActorName: null,
    lastConfirmedAt: null,
    discordReminder: false,
    reminderState: 'unavailable',
    operationId: null,
  };
  return updateWorkspace(state, workspaceId, (current, viewer) => ({
    ...current,
    revision: current.revision + 1,
    timers: [timer, ...current.timers],
    history: [
      historyEntry(current.id, viewer, {
        characterId,
        characterName: character.name,
        resource: 'timer',
        title: `Dodano timer: ${label}`,
        detail: 'Timer ręczny na karcie postaci',
        revision: current.revision + 1,
      }),
      ...current.history,
    ],
  }));
}

export function createEquipmentItem(
  state: PlayerStoreState,
  workspaceId: string,
  input: {
    readonly name: string;
    readonly category: EquipmentSlot;
    readonly enhancement?: number;
    readonly bonuses: readonly string[];
    readonly planned?: boolean;
    /** When set, reject catalog items incompatible with this class. */
    readonly forCharacterClass?: CharacterClass;
  },
): { readonly state: PlayerStoreState; readonly itemId: string | null } {
  const baseName = stripEnhancementFromName(input.name);
  if (baseName.length < 2) return { state, itemId: null };
  const enhancement = clampEnhancement(input.enhancement ?? parseEnhancementFromName(input.name));
  const name = formatEnhancedItemName(baseName, enhancement);
  const catalogHit = findGameItemByCardName(baseName) ?? findGameItemByCardName(name);

  let category = input.category;
  if (catalogHit) {
    const catalogSlot = equipmentSlotForCategory(catalogHit.category);
    if (catalogSlot === null) return { state, itemId: null };
    if (
      input.forCharacterClass &&
      !isItemCompatibleWithClass(catalogHit.category, input.forCharacterClass)
    ) {
      return { state, itemId: null };
    }
    category = catalogSlot;
  }

  let createdItemId: string | null = null;
  const next = updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const itemId = createId('item');
    createdItemId = itemId;
    const item: EquipmentItem = {
      id: itemId,
      name,
      enhancement,
      iconPath: resolveItemIconPath(name),
      category,
      levelLabel: catalogHit ? `katalog: ${catalogHit.category}` : 'własny wpis zespołu',
      // Caller-provided bonuses are considered "explicit" (user picked them).
      // When explicit bonuses exist, do not overwrite with full catalog ladders.
      bonuses:
        input.bonuses.length > 0
          ? input.bonuses.map((line) => line.trim()).filter((line) => line.length > 0)
          : resolveItemBonuses(name, enhancement, []),
      catalogLayer: catalogHit ? 'project_hard_source' : 'team_private',
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
  return { state: next, itemId: createdItemId };
}

/** Edit observed bonuses on a team equipment card (D-055 free-form / catalog lines). */
export function updateEquipmentItemBonuses(
  state: PlayerStoreState,
  workspaceId: string,
  itemId: string,
  bonuses: readonly string[],
): PlayerStoreState {
  const cleaned = bonuses.map((line) => line.trim()).filter((line) => line.length > 0);
  return updateWorkspace(state, workspaceId, (workspace, viewer) => {
    const existing = workspace.items.find((item) => item.id === itemId);
    if (!existing) return workspace;
    return {
      ...workspace,
      revision: workspace.revision + 1,
      items: workspace.items.map((item) =>
        item.id === itemId ? { ...item, bonuses: cleaned, revision: item.revision + 1 } : item,
      ),
      history: [
        historyEntry(workspace.id, viewer, {
          characterId: null,
          characterName: null,
          resource: 'equipment',
          title: `Zaktualizowano bonusy: ${existing.name}`,
          detail: cleaned.length > 0 ? cleaned.join(' · ') : 'Wyczyszczono linie bonusów',
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
        ...updateWorkspace(state, existing.id, (workspace, viewer) => {
          const hasInvite = workspace.invitations.some((entry) => entry.id === invitationId);
          const invitations = hasInvite
            ? workspace.invitations.map((entry) =>
                entry.id === invitationId ? { ...entry, status: 'accepted' as const } : entry,
              )
            : [{ ...invitation, status: 'accepted' as const }, ...workspace.invitations];
          return {
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
            invitations,
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
          };
        }),
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
            title: 'Zaproszenie zaakceptowane',
            detail: workspaceInvite.entry.recipientDisplayName,
            revision: workspace.revision + 1,
          }),
          ...workspace.history,
        ],
      })),
      pendingIncomingInvitations: state.pendingIncomingInvitations.filter(
        (entry) => entry.id !== invitationId,
      ),
      lastOpenedWorkspaceId: workspaceInvite.workspace.id,
    };
  }

  // Fallback: unknown id — do not wipe existing workspaces
  return state;
}

export function getWorkspace(state: PlayerStoreState, workspaceId: string): WorkspaceRecord | null {
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
  if (!expectedId) return 'empty';
  const item = workspace.items.find((entry) => entry.id === expectedId);
  if (!item) return 'missing';
  if (item.planned) return 'planned';
  const conflict = workspace.characters.some((otherCharacter) =>
    otherCharacter.sets.some(
      (otherSet) =>
        (otherCharacter.id !== character.id || otherSet.id !== set.id) &&
        equipmentSlots.some((otherSlot) => otherSet.assignments[otherSlot] === expectedId),
    ),
  );
  if (conflict) return 'conflict';
  if (!item.lastConfirmedLocation) return 'missing';
  if (item.lastConfirmedLocation !== character.name) return 'available_elsewhere';
  if (item.lastConfirmedAt && item.lastConfirmedAt.includes('2 dni')) return 'stale';
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
    return {
      ...parsed,
      workspaces: (parsed.workspaces ?? []).map((workspace) => ({
        ...workspace,
        items: (workspace.items ?? []).map((item) => {
          const enhancement =
            typeof item.enhancement === 'number'
              ? clampEnhancement(item.enhancement)
              : parseEnhancementFromName(item.name);
          const name = formatEnhancedItemName(item.name, enhancement);
          return {
            ...item,
            enhancement,
            name,
            iconPath: resolveItemIconPath(name, item.iconPath),
          };
        }),
      })),
    };
  } catch {
    return null;
  }
}

export { characterClassLabels, equipmentSlots, slotLabels };
