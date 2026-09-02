export type CollaborationConnectionState =
  'connected' | 'reconnecting' | 'offline' | 'access_revoked';

export type TeamHistoryResource = 'equipment' | 'timer' | 'note' | 'member' | 'character';

export interface TeamHistoryEntry {
  readonly id: string;
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

export interface ResourceEditLease {
  readonly resourceLabel: string;
  readonly editorName: string;
  readonly editorInitials: string;
  readonly expiresLabel: string;
}

export interface RevisionConflict {
  readonly id: string;
  readonly resourceLabel: string;
  readonly characterName: string;
  readonly localActorName: string;
  readonly serverActorName: string;
  readonly localDraft: string;
  readonly serverValue: string;
  readonly expectedRevision: number;
  readonly serverRevision: number;
}

export type ConflictResolution = 'preserve_draft' | 'accept_server';

export interface ResolveConflictCommand {
  readonly conflictId: string;
  readonly expectedServerRevision: number;
  readonly operationId: string;
  readonly resolution: ConflictResolution;
}

export interface TeamHistorySnapshot {
  readonly viewerName: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly connection: CollaborationConnectionState;
  readonly lastSynchronizedLabel: string;
  readonly entries: readonly TeamHistoryEntry[];
  readonly editLeases: readonly ResourceEditLease[];
  readonly conflict: RevisionConflict | null;
}

export interface TeamHistoryFilters {
  readonly query: string;
  readonly resource: TeamHistoryResource | 'all';
  readonly actorId: string;
  readonly characterId: string;
}

export interface TeamHistoryAdapter {
  getSnapshot(teamId: string): Promise<TeamHistorySnapshot>;
  resolveConflict(command: ResolveConflictCommand): Promise<{
    readonly revision: number;
    readonly draftPreserved: boolean;
  }>;
}

export const teamHistoryFixture: TeamHistorySnapshot = {
  viewerName: 'Mateusz',
  teamId: 'asteria',
  teamName: 'Asteria',
  connection: 'connected',
  lastSynchronizedLabel: 'przed chwilą',
  editLeases: [
    {
      resourceLabel: 'Set Wojna · NerwNicht',
      editorName: 'XiaoHu',
      editorInitials: 'X',
      expiresLabel: 'jeszcze około 2 min',
    },
  ],
  conflict: {
    id: 'conflict-shield-location',
    resourceLabel: 'Lokalizacja: Tarcza Bojowa +9',
    characterName: 'NerwNicht',
    localActorName: 'Mateusz',
    serverActorName: 'XiaoHu',
    localDraft: 'NerwNicht · sprawdzone teraz',
    serverValue: 'Aalpsik · potwierdzone 2 min temu',
    expectedRevision: 18,
    serverRevision: 19,
  },
  entries: [
    {
      id: 'history-shield-location',
      actorId: 'xiaohu',
      actorName: 'XiaoHu',
      actorInitials: 'X',
      characterId: 'nerwnicht',
      characterName: 'NerwNicht',
      resource: 'equipment',
      title: 'Potwierdzono lokalizację tarczy',
      detail: 'Tarcza Bojowa +9 · Aalpsik. To ręczne potwierdzenie, nie odczyt z gry.',
      occurredAtLabel: 'dzisiaj 12:08',
      revision: 19,
    },
    {
      id: 'history-war-set',
      actorId: 'mateusz',
      actorName: 'Mateusz',
      actorInitials: 'M',
      characterId: 'nerwnicht',
      characterName: 'NerwNicht',
      resource: 'equipment',
      title: 'Zmieniono plan zestawu Wojna',
      detail: 'Broń: Zatruty Miecz +6 → Krótki Nóż +9. Lokalizacja fizyczna bez zmian.',
      occurredAtLabel: 'dzisiaj 11:54',
      revision: 18,
    },
    {
      id: 'history-book-timer',
      actorId: 'aalpsik',
      actorName: 'Aalpsik',
      actorInitials: 'A',
      characterId: 'aalpsik',
      characterName: 'Aalpsik',
      resource: 'timer',
      title: 'Rozpoczęto timer księgi',
      detail: 'Następna próba za 23 godz. 58 min. Przypomnienie zespołu pozostaje włączone.',
      occurredAtLabel: 'dzisiaj 10:31',
      revision: 17,
    },
    {
      id: 'history-note',
      actorId: 'wicek',
      actorName: 'Wicek',
      actorInitials: 'W',
      characterId: null,
      characterName: null,
      resource: 'note',
      title: 'Dodano notatkę zespołu',
      detail: 'Przed wojną sprawdzić depo i potwierdzić alchemię.',
      occurredAtLabel: 'wczoraj 22:16',
      revision: 16,
    },
    {
      id: 'history-member',
      actorId: 'mateusz',
      actorName: 'Mateusz',
      actorInitials: 'M',
      characterId: null,
      characterName: null,
      resource: 'member',
      title: 'MobbynZS Oak dołączył do zespołu',
      detail: 'Dostęp nadano dopiero po zaakceptowaniu zaproszenia przez odbiorcę.',
      occurredAtLabel: 'wczoraj 19:42',
      revision: 15,
    },
  ],
};

export const connectionStateCopy: Record<
  CollaborationConnectionState,
  { readonly title: string; readonly detail: string }
> = {
  connected: {
    title: 'Połączono',
    detail: 'Zmiany zespołu są synchronizowane.',
  },
  reconnecting: {
    title: 'Ponowne łączenie',
    detail: 'Twoje wersje robocze zostają na urządzeniu. Nie zamykaj karty.',
  },
  offline: {
    title: 'Brak połączenia',
    detail: 'Możesz czytać zapisane dane, ale nowe zmiany poczekają na synchronizację.',
  },
  access_revoked: {
    title: 'Dostęp zakończony',
    detail: 'Nie możesz już odczytywać ani zmieniać prywatnych danych tego zespołu.',
  },
};

export function filterTeamHistory(
  entries: readonly TeamHistoryEntry[],
  filters: TeamHistoryFilters,
): readonly TeamHistoryEntry[] {
  const query = filters.query.trim().toLocaleLowerCase('pl');

  return entries.filter((entry) => {
    if (filters.resource !== 'all' && entry.resource !== filters.resource) return false;
    if (filters.actorId !== 'all' && entry.actorId !== filters.actorId) return false;
    if (filters.characterId !== 'all' && entry.characterId !== filters.characterId) return false;
    if (query.length === 0) return true;

    return [entry.title, entry.detail, entry.actorName, entry.characterName ?? '']
      .join(' ')
      .toLocaleLowerCase('pl')
      .includes(query);
  });
}

export function buildResolveConflictCommand(
  conflict: RevisionConflict,
  resolution: ConflictResolution,
  operationId: string,
): ResolveConflictCommand {
  if (operationId.trim().length === 0) throw new Error('operationId is required');

  return {
    conflictId: conflict.id,
    expectedServerRevision: conflict.serverRevision,
    operationId,
    resolution,
  };
}
