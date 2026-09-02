export type CatalogLayer = 'project_hard_source' | 'destiled_curated' | 'team_private';

export type QuickActionStatus =
  | 'ready'
  | 'upcoming'
  | 'done'
  | 'snoozed'
  | 'unavailable';

export type QuickActionOutcome = 'done' | 'snoozed' | 'unavailable';

export interface QuickAction {
  readonly id: string;
  readonly characterName: string;
  readonly title: string;
  readonly description: string;
  readonly dueLabel: string;
  readonly status: QuickActionStatus;
  readonly tone: 'red' | 'blue' | 'silver';
}

export interface EquipmentSetSummary {
  readonly id: string;
  readonly characterName: string;
  readonly name: string;
  readonly equippedItems: number;
  readonly requiredItems: number;
  readonly missingItemLabel: string | null;
  readonly catalogLayer: CatalogLayer;
}

export interface CharacterSummary {
  readonly id: string;
  readonly name: string;
  readonly classLabel: string;
  readonly level: number;
  readonly equipmentCount: number;
  readonly equipmentCapacity: number;
  readonly readyTimers: number;
  readonly imagePath: string;
}

export interface TeamMemberSummary {
  readonly id: string;
  readonly displayName: string;
  readonly state: 'online' | 'away' | 'offline';
  readonly initials: string;
}

export interface HistoryEntry {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly timeLabel: string;
  readonly kind: 'equipment' | 'timer' | 'member';
}

export interface MemberDashboardSnapshot {
  readonly viewerName: string;
  readonly teamName: string;
  readonly teamMembers: readonly TeamMemberSummary[];
  readonly quickActions: readonly QuickAction[];
  readonly equipmentSets: readonly EquipmentSetSummary[];
  readonly characters: readonly CharacterSummary[];
  readonly history: readonly HistoryEntry[];
}

export interface DashboardSummary {
  readonly readyActions: number;
  readonly onlineMembers: number;
  readonly readyEquipmentSets: number;
  readonly totalCharacters: number;
}

export const memberDashboardFixture: MemberDashboardSnapshot = {
  viewerName: 'Mateusz',
  teamName: 'Asteria',
  teamMembers: [
    { id: 'mateusz', displayName: 'Mateusz', state: 'online', initials: 'M' },
    { id: 'xiaohu', displayName: 'XiaoHu', state: 'online', initials: 'X' },
    { id: 'wicek', displayName: 'Wicek', state: 'away', initials: 'W' },
    { id: 'aalpsik', displayName: 'Aalpsik', state: 'offline', initials: 'A' },
  ],
  quickActions: [
    {
      id: 'horse-medal-aalpsik',
      characterName: 'Aalpsik',
      title: 'Medal konny',
      description: 'Można rozpocząć kolejną próbę.',
      dueLabel: 'Gotowe teraz',
      status: 'ready',
      tone: 'red',
    },
    {
      id: 'skill-book-nerwnicht',
      characterName: 'NerwNicht',
      title: 'Księga umiejętności',
      description: 'Bot przypomni przypisanej osobie na Discordzie.',
      dueLabel: 'za 24 min',
      status: 'upcoming',
      tone: 'blue',
    },
    {
      id: 'war-set-nerwnicht',
      characterName: 'NerwNicht',
      title: 'Set: Wojna',
      description: 'Brakuje ostatniego potwierdzenia lokalizacji tarczy.',
      dueLabel: '7 / 8 elementów',
      status: 'ready',
      tone: 'silver',
    },
  ],
  equipmentSets: [
    {
      id: 'war-nerwnicht',
      characterName: 'NerwNicht',
      name: 'Wojna',
      equippedItems: 7,
      requiredItems: 8,
      missingItemLabel: 'Tarcza bojowa +9',
      catalogLayer: 'destiled_curated',
    },
    {
      id: 'dungeon-aalpsik',
      characterName: 'Aalpsik',
      name: 'Dungeon',
      equippedItems: 8,
      requiredItems: 8,
      missingItemLabel: null,
      catalogLayer: 'team_private',
    },
  ],
  characters: [
    {
      id: 'nerwnicht',
      name: 'NerwNicht',
      classLabel: 'Sura',
      level: 75,
      equipmentCount: 8,
      equipmentCapacity: 8,
      readyTimers: 1,
      imagePath: '/game/classes/sura-male.png',
    },
    {
      id: 'aalpsik',
      name: 'Aalpsik',
      classLabel: 'Ninja',
      level: 55,
      equipmentCount: 7,
      equipmentCapacity: 8,
      readyTimers: 1,
      imagePath: '/game/classes/ninja-female.png',
    },
    {
      id: 'kimmizic',
      name: 'Kimmizic',
      classLabel: 'Szaman',
      level: 61,
      equipmentCount: 6,
      equipmentCapacity: 8,
      readyTimers: 0,
      imagePath: '/game/classes/shaman-male.png',
    },
  ],
  history: [
    {
      id: 'history-equipment',
      title: 'Zatruty Miecz → NerwNicht',
      detail: 'XiaoHu potwierdził nową lokalizację przedmiotu',
      timeLabel: '22:41',
      kind: 'equipment',
    },
    {
      id: 'history-timer',
      title: 'Księga oznaczona jako przeczytana',
      detail: 'Mateusz · NerwNicht',
      timeLabel: '21:12',
      kind: 'timer',
    },
    {
      id: 'history-member',
      title: 'Wicek dołączył do zespołu',
      detail: 'Zaproszenie zaakceptowane przez Discord',
      timeLabel: 'wczoraj',
      kind: 'member',
    },
  ],
};

export function getDashboardSummary(snapshot: MemberDashboardSnapshot): DashboardSummary {
  return {
    readyActions: snapshot.quickActions.filter((action) => action.status === 'ready').length,
    onlineMembers: snapshot.teamMembers.filter((member) => member.state === 'online').length,
    readyEquipmentSets: snapshot.equipmentSets.filter(
      (set) => set.equippedItems === set.requiredItems,
    ).length,
    totalCharacters: snapshot.characters.length,
  };
}

export function applyQuickActionOutcome(
  actions: readonly QuickAction[],
  actionId: string,
  outcome: QuickActionOutcome,
): readonly QuickAction[] {
  return actions.map((action) =>
    action.id === actionId
      ? {
          ...action,
          status: outcome,
          dueLabel:
            outcome === 'done'
              ? 'Zrobione'
              : outcome === 'snoozed'
                ? 'Przypomnij później'
                : 'Nie mogę wykonać',
        }
      : action,
  );
}
