import type { CharacterProfileAdapter, SaveCharacterProfileCommand } from '../character-profile';
import { fromClassSpecKey, toClassSpecKey } from '../lib/class-spec-adapter';
import {
  createCharacterBoard,
  PlayerWorkspaceConflictError,
  updateCharacterBoard,
} from '../lib/player-workspace-api';

export { PlayerWorkspaceConflictError };

export class HttpCharacterProfileAdapter implements CharacterProfileAdapter {
  public async saveProfile(command: SaveCharacterProfileCommand): Promise<{
    readonly characterId: string;
    readonly teamRevision: number;
    readonly characterRevision: number;
  }> {
    const classSpecKey = toClassSpecKey(command.profile.characterClass, command.profile.gender);
    const linkedPlayerCharacterId = command.profile.linkedPlayerCharacterId ?? null;

    if (command.characterId === null) {
      const result = await createCharacterBoard(command.teamId, {
        displayName: command.profile.name,
        classSpecKey,
        level: command.profile.level,
        linkedPlayerCharacterId,
        expectedTeamRevision: command.expectedTeamRevision,
        operationId: command.operationId,
      });
      return {
        characterId: result.board.id,
        teamRevision: result.teamRevision,
        characterRevision: result.board.revision,
      };
    }

    if (command.expectedCharacterRevision === null) {
      throw new Error('expectedCharacterRevision is required for update');
    }

    const board = await updateCharacterBoard(command.teamId, command.characterId, {
      displayName: command.profile.name,
      classSpecKey,
      level: command.profile.level,
      linkedPlayerCharacterId,
      expectedBoardRevision: command.expectedCharacterRevision,
    });

    return {
      characterId: board.id,
      teamRevision: command.expectedTeamRevision,
      characterRevision: board.revision,
    };
  }
}

export function boardToProfileDraft(board: {
  readonly displayName: string;
  readonly classSpecKey: string;
  readonly level: number | null;
}): {
  readonly name: string;
  readonly characterClass: ReturnType<typeof fromClassSpecKey>['characterClass'];
  readonly gender: ReturnType<typeof fromClassSpecKey>['gender'];
  readonly level: number | null;
  readonly responsibleMemberId: string;
  readonly startingSetName: string;
  readonly teamNote: string;
} {
  const { characterClass, gender } = fromClassSpecKey(board.classSpecKey);
  return {
    name: board.displayName,
    characterClass,
    gender,
    level: board.level,
    responsibleMemberId: '',
    startingSetName: '',
    teamNote: '',
  };
}
