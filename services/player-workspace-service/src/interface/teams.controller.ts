import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { PlayerWorkspaceRepository } from '../application/ports/player-workspace.ports.js';
import { resolveClassSpecLabel } from '../domain/class-spec.js';
import { PlayerWorkspaceError } from '../domain/errors.js';
import type { AuthenticatedRequest } from './inbound-assertion.guard.js';
import { InboundAssertionGuard } from './inbound-assertion.guard.js';
import { PlayerWorkspaceExceptionFilter } from './player-workspace-exception.filter.js';
import { PLAYER_WORKSPACE_REPOSITORY } from './player-workspace.tokens.js';

function requireActor(request: AuthenticatedRequest): string {
  const actor = request.verifiedActor?.v2UserId;
  if (actor === undefined || actor.length === 0) {
    throw new PlayerWorkspaceError('UNAUTHENTICATED', 'Missing authenticated actor');
  }
  return actor;
}

const createTeamSchema = z.object({
  name: z.string().min(1).max(80),
});

const inviteSchema = z.object({
  targetUserId: z.string().min(1).max(128),
  expectedTeamRevision: z.number().int().positive(),
  operationId: z.string().min(1).max(128),
});

const invitationActionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  operationId: z.string().min(1).max(128).optional(),
});

const removeMemberSchema = z.object({
  expectedTeamRevision: z.number().int().positive(),
});

const boardBodySchema = z.object({
  displayName: z.string().min(2).max(24),
  classSpecKey: z.string().min(1).max(64),
  level: z.number().int().min(1).max(999).nullable().optional(),
  linkedPlayerCharacterId: z.string().uuid().nullable().optional(),
  expectedTeamRevision: z.number().int().positive().optional(),
  expectedBoardRevision: z.number().int().positive().optional(),
  operationId: z.string().min(1).max(128).optional(),
});

@Controller('player-workspace/v1')
@UseGuards(InboundAssertionGuard)
@UseFilters(PlayerWorkspaceExceptionFilter)
export class TeamsController {
  public constructor(
    @Inject(PLAYER_WORKSPACE_REPOSITORY)
    private readonly repo: PlayerWorkspaceRepository,
  ) {}

  @Get('teams')
  public async listMyTeams(@Req() request: AuthenticatedRequest) {
    const actor = requireActor(request);
    const teams = await this.repo.listTeamsForUser(actor);
    return { teams };
  }

  @Post('teams')
  @HttpCode(201)
  public async createTeam(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const actor = requireActor(request);
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid create team payload');
    }
    return this.repo.createTeam({ name: parsed.data.name, actorUserId: actor });
  }

  @Get('teams/:teamId')
  public async getTeam(@Req() request: AuthenticatedRequest, @Param('teamId') teamId: string) {
    const actor = requireActor(request);
    return this.repo.getTeamDetail(teamId, actor);
  }

  @Post('teams/:teamId/invitations')
  @HttpCode(201)
  public async invite(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid invite payload');
    }
    const invitation = await this.repo.createInvitation({
      teamId,
      actorUserId: actor,
      targetUserId: parsed.data.targetUserId,
      expectedTeamRevision: parsed.data.expectedTeamRevision,
      operationId: parsed.data.operationId,
    });
    return { invitation };
  }

  @Post('invitations/:invitationId/accept')
  public async accept(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = invitationActionSchema.safeParse(body);
    if (!parsed.success || parsed.data.operationId === undefined) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid accept payload');
    }
    const invitation = await this.repo.acceptInvitation({
      invitationId,
      actorUserId: actor,
      expectedRevision: parsed.data.expectedRevision,
      operationId: parsed.data.operationId,
    });
    return { invitation };
  }

  @Post('invitations/:invitationId/reject')
  public async reject(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = invitationActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid reject payload');
    }
    const invitation = await this.repo.rejectInvitation({
      invitationId,
      actorUserId: actor,
      expectedRevision: parsed.data.expectedRevision,
    });
    return { invitation };
  }

  @Post('invitations/:invitationId/revoke')
  public async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = invitationActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid revoke payload');
    }
    const invitation = await this.repo.revokeInvitation({
      invitationId,
      actorUserId: actor,
      expectedRevision: parsed.data.expectedRevision,
    });
    return { invitation };
  }

  @Delete('teams/:teamId/members/:userId')
  public async removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = removeMemberSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid remove member payload');
    }
    return this.repo.removeMember({
      teamId,
      actorUserId: actor,
      targetUserId: userId,
      expectedTeamRevision: parsed.data.expectedTeamRevision,
    });
  }

  @Get('teams/:teamId/character-boards')
  public async listBoards(@Req() request: AuthenticatedRequest, @Param('teamId') teamId: string) {
    const actor = requireActor(request);
    const boards = await this.repo.listCharacterBoards(teamId, actor);
    return {
      boards: boards.map((board) => ({
        ...board,
        classSpecLabel: resolveClassSpecLabel(board.classSpecKey),
        startingSetName: null,
      })),
    };
  }

  @Post('teams/:teamId/character-boards')
  @HttpCode(201)
  public async createBoard(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = boardBodySchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.expectedTeamRevision === undefined ||
      parsed.data.operationId === undefined
    ) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid create board payload');
    }
    const result = await this.repo.createCharacterBoard({
      teamId,
      actorUserId: actor,
      expectedTeamRevision: parsed.data.expectedTeamRevision,
      displayName: parsed.data.displayName,
      classSpecKey: parsed.data.classSpecKey,
      level: parsed.data.level ?? null,
      linkedPlayerCharacterId: parsed.data.linkedPlayerCharacterId ?? null,
      operationId: parsed.data.operationId,
    });
    return {
      board: {
        ...result.board,
        classSpecLabel: resolveClassSpecLabel(result.board.classSpecKey),
        startingSetName: null,
      },
      teamRevision: result.teamRevision,
    };
  }

  @Get('teams/:teamId/character-boards/:boardId')
  public async getBoard(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('boardId') boardId: string,
  ) {
    const actor = requireActor(request);
    const board = await this.repo.getCharacterBoard(teamId, boardId, actor);
    return {
      board: {
        ...board,
        classSpecLabel: resolveClassSpecLabel(board.classSpecKey),
        startingSetName: null,
      },
    };
  }

  @Patch('teams/:teamId/character-boards/:boardId')
  public async updateBoard(
    @Req() request: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Param('boardId') boardId: string,
    @Body() body: unknown,
  ) {
    const actor = requireActor(request);
    const parsed = boardBodySchema.safeParse(body);
    if (!parsed.success || parsed.data.expectedBoardRevision === undefined) {
      throw new PlayerWorkspaceError('VALIDATION_FAILED', 'Invalid update board payload');
    }
    const board = await this.repo.updateCharacterBoard({
      teamId,
      boardId,
      actorUserId: actor,
      expectedBoardRevision: parsed.data.expectedBoardRevision,
      displayName: parsed.data.displayName,
      classSpecKey: parsed.data.classSpecKey,
      level: parsed.data.level ?? null,
      linkedPlayerCharacterId: parsed.data.linkedPlayerCharacterId ?? null,
    });
    return {
      board: {
        ...board,
        classSpecLabel: resolveClassSpecLabel(board.classSpecKey),
        startingSetName: null,
      },
    };
  }
}
