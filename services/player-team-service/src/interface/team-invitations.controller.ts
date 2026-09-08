import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { TeamInvitationsUseCases } from '../application/use-cases/team-invitations.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, TEAM_INVITATIONS_USE_CASES } from './player-team.tokens.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

type RequestHeaders = Record<string, string | string[] | undefined>;

const createInvitationSchema = z.object({
  recipientDiscordId: z.string().regex(/^\d{17,20}$/),
  recipientDisplayName: z.string().trim().min(1).max(80),
});

function firstHeader(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

@Controller('player-team/v1/invitations')
@UseFilters(PlayerTeamExceptionFilter)
export class TeamInvitationsController {
  public constructor(
    @Inject(TEAM_INVITATIONS_USE_CASES) private readonly useCases: TeamInvitationsUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
    private readonly liveBus: WorkspaceLiveBus,
  ) {}

  private viewerId(headers: RequestHeaders): string {
    return this.useCases.assertAccess(
      firstHeader(headers, this.env.PLAYER_TEAM_DEMO_VIEWER_HEADER),
    );
  }

  private viewerAppId(headers: RequestHeaders): string | null {
    const value = firstHeader(headers, 'x-v2-user-id')?.trim();
    return value ? value : null;
  }

  private publishWorkspace(
    result: {
      readonly workspaceId: string;
      readonly workspace: Record<string, unknown>;
      readonly revision: number;
    },
    viewerId: string,
  ): void {
    this.liveBus.publish({
      workspaceId: result.workspaceId,
      state: result.workspace,
      revision: result.revision,
      updatedByUserId: viewerId,
      updatedAtIso: new Date().toISOString(),
    });
  }

  @Get()
  public async listIncoming(@Headers() headers: RequestHeaders) {
    return this.useCases.listPendingInvitations(this.viewerId(headers));
  }

  @Post('workspace/:workspaceId')
  public async create(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = createInvitationSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    const viewerId = this.viewerId(headers);
    const result = await this.useCases.createInvitation({
      ownerDiscordId: viewerId,
      workspaceId,
      recipientDiscordId: parsed.data.recipientDiscordId,
      recipientDisplayName: parsed.data.recipientDisplayName,
    });
    this.publishWorkspace(result, viewerId);
    return result;
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
      recipientAppId: this.viewerAppId(headers),
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
      recipientAppId: this.viewerAppId(headers),
      invitationId,
      decision: 'decline',
    });
    this.publishWorkspace(result, viewerId);
    return result;
  }
}
