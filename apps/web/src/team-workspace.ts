export type TeamTaskStatus = 'ready' | 'upcoming' | 'done' | 'snoozed' | 'unavailable';
export type TeamTaskOutcome = 'done' | 'snoozed' | 'unavailable';

export interface WorkspaceMember {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly state: 'online' | 'away' | 'offline';
  readonly roleLabel: string;
}

export interface WorkspaceCharacter {
  readonly id: string;
  readonly name: string;
  readonly classLabel: string;
  readonly level: number;
  readonly imagePath: string;
  readonly responsibleMember: string;
  readonly equipmentConfirmed: number;
  readonly equipmentCapacity: number;
  readonly activeSetName: string;
  readonly readyTimers: number;
  readonly nextTimerLabel: string;
  readonly collaboratorLabel: string | null;
}

export interface TeamTask {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly characterName: string;
  readonly assigneeName: string;
  readonly dueLabel: string;
  readonly status: TeamTaskStatus;
  readonly source: 'team' | 'timer' | 'equipment';
}

export interface TeamNote {
  readonly id: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdLabel: string;
  readonly pinned: boolean;
}

export interface TeamWorkspaceSnapshot {
  readonly viewerName: string;
  readonly teamName: string;
  readonly teamDescription: string;
  readonly members: readonly WorkspaceMember[];
  readonly characters: readonly WorkspaceCharacter[];
  readonly tasks: readonly TeamTask[];
  readonly notes: readonly TeamNote[];
  readonly lastSynchronizedLabel: string;
}

export interface TeamWorkspaceSummary {
  readonly onlineMembers: number;
  readonly readyTasks: number;
  readonly totalCharacters: number;
  readonly incompleteSets: number;
}

export const teamWorkspaceFixture: TeamWorkspaceSnapshot = {
  viewerName: 'Mateusz',
  teamName: 'Asteria',
  teamDescription: 'Wspólna przestrzeń postaci, ekwipunku i codziennych potwierdzeń zespołu.',
  lastSynchronizedLabel: 'przed chwilą',
  members: [
    {
      id: 'mateusz',
      displayName: 'Mateusz',
      initials: 'M',
      state: 'online',
      roleLabel: 'Właściciel',
    },
    { id: 'xiaohu', displayName: 'XiaoHu', initials: 'X', state: 'online', roleLabel: 'Członek' },
    { id: 'wicek', displayName: 'Wicek', initials: 'W', state: 'away', roleLabel: 'Członek' },
    {
      id: 'aalpsik',
      displayName: 'Aalpsik',
      initials: 'A',
      state: 'offline',
      roleLabel: 'Członek',
    },
  ],
  characters: [
    {
      id: 'nerwnicht',
      name: 'NerwNicht',
      classLabel: 'Sura',
      level: 75,
      imagePath: '/game/classes/sura-male.png',
      responsibleMember: 'Mateusz',
      equipmentConfirmed: 7,
      equipmentCapacity: 8,
      activeSetName: 'Wojna',
      readyTimers: 1,
      nextTimerLabel: 'Księga za 24 min',
      collaboratorLabel: 'XiaoHu przegląda kartę',
    },
    {
      id: 'aalpsik',
      name: 'Aalpsik',
      classLabel: 'Ninja',
      level: 55,
      imagePath: '/game/classes/ninja-female.png',
      responsibleMember: 'Aalpsik',
      equipmentConfirmed: 8,
      equipmentCapacity: 8,
      activeSetName: 'Dungeon',
      readyTimers: 1,
      nextTimerLabel: 'Medal gotowy',
      collaboratorLabel: null,
    },
    {
      id: 'kimmizic',
      name: 'Kimmizic',
      classLabel: 'Szaman',
      level: 61,
      imagePath: '/game/classes/shaman-male.png',
      responsibleMember: 'Wicek',
      equipmentConfirmed: 6,
      equipmentCapacity: 8,
      activeSetName: 'Wsparcie',
      readyTimers: 0,
      nextTimerLabel: 'Biolog jutro 08:10',
      collaboratorLabel: null,
    },
  ],
  tasks: [
    {
      id: 'task-shield-location',
      title: 'Potwierdź lokalizację tarczy',
      detail: 'Ostatni zapis wskazuje postać Aalpsik. Sprawdź w grze i potwierdź ręcznie.',
      characterName: 'NerwNicht',
      assigneeName: 'Mateusz',
      dueLabel: 'teraz',
      status: 'ready',
      source: 'equipment',
    },
    {
      id: 'task-horse-medal',
      title: 'Medal konny',
      detail: 'Timer minął. Bot wyśle przypomnienie przypisanej osobie na Discordzie.',
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
      authorName: 'Mateusz',
      body: 'Na wojnę przygotować set pod ludzi. Tarcza musi wrócić na NerwNicht.',
      createdLabel: 'dzisiaj 09:42',
      pinned: true,
    },
    {
      id: 'note-alchemy',
      authorName: 'XiaoHu',
      body: 'Alchemia dla Aalpsik jest w depo. Nie przenosiłem jej na inną postać.',
      createdLabel: 'wczoraj 23:18',
      pinned: false,
    },
  ],
};

export function getTeamWorkspaceSummary(snapshot: TeamWorkspaceSnapshot): TeamWorkspaceSummary {
  return {
    onlineMembers: snapshot.members.filter((member) => member.state === 'online').length,
    readyTasks: snapshot.tasks.filter((task) => task.status === 'ready').length,
    totalCharacters: snapshot.characters.length,
    incompleteSets: snapshot.characters.filter(
      (character) => character.equipmentConfirmed < character.equipmentCapacity,
    ).length,
  };
}

export function applyTeamTaskOutcome(
  tasks: readonly TeamTask[],
  taskId: string,
  outcome: TeamTaskOutcome,
): readonly TeamTask[] {
  return tasks.map((task) =>
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
}

export function appendTeamNote(notes: readonly TeamNote[], note: TeamNote): readonly TeamNote[] {
  const normalizedBody = note.body.trim();
  return normalizedBody.length === 0 ? notes : [{ ...note, body: normalizedBody }, ...notes];
}

