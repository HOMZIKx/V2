import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Put,
  Sse,
  UseFilters,
  type MessageEvent,
} from '@nestjs/common';
import { concat, from, map, mergeMap, type Observable } from 'rxjs';
import { z } from 'zod';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

const putWorkspaceStateBodySchema = z.object({
  state: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative().nullable().optional(),
});

@Controller('player-team/v1/workspaces')
@UseFilters(PlayerTeamExceptionFilter)
export class WorkspaceLiveController {
  public constructor(
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly useCases: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
    private readonly liveBus: WorkspaceLiveBus,
  ) {}

  private viewerId(headers: Record<string, string | string[] | undefined>): string {
    const headerName = this.env.PLAYER_TEAM_DEMO_VIEWER_HEADER.toLowerCase();
    const value = headers[headerName];
    return this.useCases.assertDemoAccess(Array.isArray(value) ? value[0] : value);
  }

  @Get(':workspaceId/state')
  public async getState(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.useCases.getWorkspaceSnapshot(this.viewerId(headers), workspaceId);
  }

  @Put(':workspaceId/state')
  @HttpCode(200)
  public async putState(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('workspaceId') workspaceId: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = putWorkspaceStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const record = await this.useCases.upsertWorkspaceSnapshot({
      ownerUserId: this.viewerId(headers),
      workspaceId,
      state: parsed.data.state,
      expectedRevision: parsed.data.expectedRevision ?? null,
    });
    this.liveBus.publish(record);
    return record;
  }

  @Sse(':workspaceId/events')
  public events(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('workspaceId') workspaceId: string,
  ): Observable<MessageEvent> {
    const ownerUserId = this.viewerId(headers);
    const initial = from(this.useCases.getWorkspaceSnapshot(ownerUserId, workspaceId)).pipe(
      map((record) => ({ type: 'workspace', data: record }) satisfies MessageEvent),
    );
    const updates = this.liveBus.events(workspaceId).pipe(
      mergeMap(() => from(this.useCases.getWorkspaceSnapshot(ownerUserId, workspaceId))),
      map((record) => ({ type: 'workspace', data: record }) satisfies MessageEvent),
    );
    return concat(initial, updates);
  }
}
