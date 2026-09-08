import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';

import { TeamInvitationsUseCases } from '../application/use-cases/team-invitations.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, TEAM_INVITATIONS_USE_CASES } from './player-team.tokens.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller('player-team/v1/invitations')
@UseFilters(PlayerTeamExceptionFilter)
export class TeamInvitationsController {
  public constructor(
    @Inject(TEAM_INVITATIONS_USE_CASES) private readonly useCases: TeamInvitationsUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
    private readonly liveBus: WorkspaceLiveBus,
  ) {}

  private viewerId(headers: RequestHeaders): string {
    const headerName = this.env.PLAYER_TEAM_DEMO_VIEWER_HEADER.toLowerCase();
    const value = headers[headerName];
    return this.useCases.assertAccess(Array.isArray(value) ? value[0] : value);
  }

  private publishWorkspace(result: {
    readonly workspaceId: string;
    readonly workspace: Record<string, unknown>;
    readonly revision: number;
  }, viewerId: string): void {
    this.liveBus.publish({
      workspaceId: result.workspaceId,
      state: result.workspace,
      revision: result.revision,
      updatedByUserId: viewerId,
      updatedAtIso: new Date().toISOString(),
    });
  }

  @Get(':invitationId')
  public async getInvitation(
    @Headers() headers: RequestHeaders,
    @Param('invitationId') invitationId: string,
  ) {
    return this.useCases.getInvitation(this.viewerId(headers), invitationId);
  }

  @Post(':invitationId/accept')
  public async accept(
    @Headers() headers: RequestHeaders,
    @Param('invitationId') invitationId: string,
  ) {
    const viewerId = this.viewerId(headers);
    const result = await this.useCases.respond({
      recipientDiscordId: viewerId,
      invitationId,
      decision: 'accept',
    });
    this.publishWorkspace(result, viewerId);
    return result;
  }

  @Post(':invitationId/decline')
  public async decline(
    @Headers() headers: RequestHeaders,
    @Param('invitationId') invitationId: string,
  ) {
    const viewerId = this.viewerId(headers);
    const result = await this.useCases.respond({
      recipientDiscordId: viewerId,
      invitationId,
      decision: 'decline',
    });
    this.publishWorkspace(result, viewerId);
    return result;
  }
}
