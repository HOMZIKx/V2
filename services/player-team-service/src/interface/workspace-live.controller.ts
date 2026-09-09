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
import {
  concat,
  distinctUntilChanged,
  from,
  map,
  merge,
  mergeMap,
  timer,
  type Observable,
} from 'rxjs';
import { z } from 'zod';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

const putWorkspaceStateBodySchema = z.object({
  state: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative().nullable().optional(),
});

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller('player-team/v1/workspaces')
@UseFilters(PlayerTeamExceptionFilter)
export class WorkspaceLiveController {
  public constructor(
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly useCases: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
    private readonly liveBus: WorkspaceLiveBus,
  ) {}

  private viewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (value) => this.useCases.assertDemoAccess(value),
    });
  }

  @Get(':workspaceId/state')
  public async getState(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.useCases.getWorkspaceSnapshot(await this.viewerId(headers), workspaceId);
  }

  @Put(':workspaceId/state')
  @HttpCode(200)
  public async putState(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = putWorkspaceStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const record = await this.useCases.upsertWorkspaceSnapshot({
      ownerUserId: await this.viewerId(headers),
      workspaceId,
      state: parsed.data.state,
      expectedRevision: parsed.data.expectedRevision ?? null,
    });
    this.liveBus.publish(record);
    return record;
  }

  @Sse(':workspaceId/events')
  public events(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
  ): Observable<MessageEvent> {
    return from(this.viewerId(headers)).pipe(
      mergeMap((ownerUserId) => {
        const readCurrent = () => from(this.useCases.getWorkspaceSnapshot(ownerUserId, workspaceId));

        // Local bus gives near-instant updates on a single instance. The database
        // poll makes the stream correct across multiple Player Team instances and
        // after process restarts/redeploys because PostgreSQL is authoritative.
        const initial = readCurrent();
        const localUpdates = this.liveBus.events(workspaceId).pipe(mergeMap(readCurrent));
        const databaseUpdates = timer(1_000, 1_000).pipe(mergeMap(readCurrent));

        return concat(initial, merge(localUpdates, databaseUpdates)).pipe(
          distinctUntilChanged((previous, next) => previous.revision === next.revision),
          map((record) => ({ type: 'workspace', data: record }) satisfies MessageEvent),
        );
      }),
    );
  }
}
