import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import { z } from 'zod';

import { PlayerTeamStateService } from '../application/player-team-state.service.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PLAYER_TEAM_ENV } from './player-team.tokens.js';

const putWorkspaceStateBodySchema = z.object({
  state: z.unknown(),
  expectedRevision: z.number().int().nonnegative().optional(),
});

type PutWorkspaceStateBody = z.infer<typeof putWorkspaceStateBodySchema>;

@Controller('player-team/v1')
export class PlayerTeamController {
  public constructor(
    private readonly service: PlayerTeamStateService,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private demoHeaderValueFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
    const headerName = this.env.PLAYER_TEAM_DEMO_VIEWER_HEADER.toLowerCase();
    const value = headers[headerName];
    if (Array.isArray(value)) return value[0];
    return value;
  }

  @Get('me/workspaces')
  public async listMyWorkspaces(@Headers() headers: Record<string, string | string[] | undefined>) {
    const demoHeaderValue = this.demoHeaderValueFromHeaders(headers);
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue });
    const workspaces = await this.service.listWorkspacesForOwner(ownerUserId);

    return {
      workspaces: workspaces.map((w) => ({
        workspaceId: w.workspaceId,
        state: w.state,
        revision: w.revision,
        updatedAtIso: w.updatedAtIso,
      })),
    };
  }

  @Get('me/state')
  public async getMyState(@Headers() headers: Record<string, string | string[] | undefined>) {
    const demoHeaderValue = this.demoHeaderValueFromHeaders(headers);
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue });

    const record = await this.service.getViewerStateOrNull({ ownerUserId });
    if (record === null) {
      return { state: null };
    }

    return {
      state: record.state,
      revision: record.revision,
      updatedAtIso: record.updatedAtIso,
    };
  }

  @Get('workspaces/:workspaceId/state')
  public async getWorkspaceState(
    @Param('workspaceId') workspaceId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const demoHeaderValue = this.demoHeaderValueFromHeaders(headers);
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue });

    const record = await this.service.getWorkspaceStateOrThrow({ ownerUserId, workspaceId });
    return {
      workspaceId: record.workspaceId,
      state: record.state,
      revision: record.revision,
      updatedAtIso: record.updatedAtIso,
    };
  }

  @Put('workspaces/:workspaceId/state')
  public async putWorkspaceState(
    @Param('workspaceId') workspaceId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() rawBody: unknown,
  ) {
    const demoHeaderValue = this.demoHeaderValueFromHeaders(headers);
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue });

    const parsed = putWorkspaceStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const body: PutWorkspaceStateBody = parsed.data;

    const { revision } = await this.service.upsertWorkspaceState({
      ownerUserId,
      workspaceId,
      state: body.state,
      expectedRevision: body.expectedRevision ?? null,
    });

    return { workspaceId, revision };
  }

  @Put('me/state')
  public async putMyState(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() rawBody: unknown,
  ) {
    const demoHeaderValue = this.demoHeaderValueFromHeaders(headers);
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue });

    const parsed = putWorkspaceStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const body: PutWorkspaceStateBody = parsed.data;

    const { revision } = await this.service.upsertViewerState({
      ownerUserId,
      state: body.state,
      expectedRevision: body.expectedRevision ?? null,
    });

    return { revision };
  }
}

