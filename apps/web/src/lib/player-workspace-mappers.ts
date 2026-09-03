import type { CharacterProfileSnapshot } from '../character-profile';
import { characterClassLabels, getApprovedCharacterRender } from '../character-profile';
import type { MemberDashboardSnapshot } from '../member-dashboard';
import type { TeamWorkspaceSnapshot } from '../team-workspace';
import { fromClassSpecKey } from './class-spec-adapter';
import type {
  CharacterBoardRecordDto,
  TeamDetailDto,
  TeamMemberRecordDto,
  TeamRecordDto,
} from './player-workspace-api';

function memberDisplay(userId: string): { displayName: string; initials: string } {
  const short = userId.slice(0, 8);
  return {
    displayName: `Użytkownik ${short}`,
    initials: short.slice(0, 2).toUpperCase(),
  };
}

function mapMemberSummary(member: TeamMemberRecordDto) {
  const display = memberDisplay(member.userId);
  return {
    id: member.userId,
    displayName: display.displayName,
    state: 'offline' as const,
    initials: display.initials,
  };
}

export function mapTeamDetailToDashboard(
  viewerName: string,
  team: TeamRecordDto,
  members: readonly TeamMemberRecordDto[],
): MemberDashboardSnapshot {
  return {
    viewerName,
    teamName: team.name,
    teamMembers: members.map(mapMemberSummary),
    quickActions: [],
    equipmentSets: [],
    characters: [],
    history: [],
  };
}

export function mapBoardsToDashboardCharacters(
  boards: readonly CharacterBoardRecordDto[],
): MemberDashboardSnapshot['characters'] {
  return boards.map((board) => {
    const { characterClass, gender } = fromClassSpecKey(board.classSpecKey);
    const imagePath = getApprovedCharacterRender(characterClass, gender);
    return {
      id: board.id,
      name: board.displayName,
      classLabel: board.classSpecLabel ?? characterClassLabels[characterClass],
      level: board.level ?? 0,
      equipmentCount: 0,
      equipmentCapacity: 8,
      readyTimers: 0,
      imagePath: imagePath ?? '',
    };
  });
}

export function mapTeamDetailToWorkspace(
  viewerName: string,
  detail: TeamDetailDto,
  boards: readonly CharacterBoardRecordDto[],
): TeamWorkspaceSnapshot {
  return {
    viewerName,
    teamName: detail.team.name,
    teamDescription: 'Wspólna przestrzeń postaci, ekwipunku i codziennych potwierdzeń zespołu.',
    lastSynchronizedLabel: 'przed chwilą',
    members: detail.members.map((member) => {
      const display = memberDisplay(member.userId);
      return {
        id: member.userId,
        displayName: display.displayName,
        initials: display.initials,
        state: 'offline' as const,
        roleLabel: member.role === 'OWNER' ? 'Właściciel' : 'Członek',
      };
    }),
    characters: boards.map((board) => {
      const { characterClass, gender } = fromClassSpecKey(board.classSpecKey);
      const imagePath = getApprovedCharacterRender(characterClass, gender);
      return {
        id: board.id,
        name: board.displayName,
        classLabel: board.classSpecLabel ?? characterClassLabels[characterClass],
        level: board.level ?? 0,
        imagePath: imagePath ?? '',
        responsibleMember: '—',
        equipmentConfirmed: 0,
        equipmentCapacity: 8,
        activeSetName: '—',
        readyTimers: 0,
        nextTimerLabel: '—',
        collaboratorLabel: null,
      };
    }),
    tasks: [],
    notes: [],
  };
}

export function mapTeamDetailToCharacterProfileSnapshot(
  viewerName: string,
  detail: TeamDetailDto,
  board: CharacterBoardRecordDto | null,
): CharacterProfileSnapshot {
  return {
    viewerName,
    teamId: detail.team.id,
    teamName: detail.team.name,
    teamRevision: detail.team.revision,
    characterId: board?.id ?? null,
    characterRevision: board?.revision ?? null,
    members: detail.members.map((member) => ({
      id: member.userId,
      displayName: memberDisplay(member.userId).displayName,
    })),
    draft:
      board === null
        ? {
            name: '',
            characterClass: 'sura',
            gender: 'male',
            level: null,
            responsibleMemberId: detail.members[0]?.userId ?? '',
            startingSetName: '',
            teamNote: '',
          }
        : {
            name: board.displayName,
            ...fromClassSpecKey(board.classSpecKey),
            level: board.level,
            responsibleMemberId: detail.members[0]?.userId ?? '',
            startingSetName: '',
            teamNote: '',
          },
  };
}
