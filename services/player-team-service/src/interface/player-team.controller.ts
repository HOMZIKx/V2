import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Put,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';

const putViewerStateBodySchema = z.object({
  state: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative().optional(),
});

type PutViewerStateBody = z.infer<typeof putViewerStateBodySchema>;

@Controller('player-team/v1')
@UseFilters(PlayerTeamExceptionFilter)
export class PlayerTeamController {
  public constructor(
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly useCases: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private demoViewerIdFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): string | undefined {
    const headerName = this.env.PLAYER_TEAM_DEMO_VIEWER_HEADER.toLowerCase();
    const value = headers[headerName];
    if (Array.isArray(value)) return value[0];
    return value;
  }

  /**
   * GET /player-team/v1/me/state
   * Returns the viewer's last saved PlayerStoreState snapshot plus its revision.
   * Returns { state: null } when no snapshot exists yet.
   */
  @Get('me/state')
  public async getMyState(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{
    state: Record<string, unknown> | null;
    revision?: number;
    updatedAtIso?: string;
  }> {
    const demoViewerId = this.demoViewerIdFromHeaders(headers);
    const ownerUserId = this.useCases.assertDemoAccess(demoViewerId);

    const record = await this.useCases.getViewerSnapshot(ownerUserId);
    if (record === null) return { state: null };

    return {
      state: record.state,
      revision: record.revision,
      updatedAtIso: record.updatedAtIso,
    };
  }

  /**
   * PUT /player-team/v1/me/state
   * Body: { state: PlayerStoreState, expectedRevision?: number }
   * Saves the viewer's PlayerStoreState snapshot. Uses optimistic concurrency
   * when expectedRevision is provided.
   */
  @Put('me/state')
  @HttpCode(200)
  public async putMyState(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() rawBody: unknown,
  ): Promise<{ revision: number }> {
    const demoViewerId = this.demoViewerIdFromHeaders(headers);
    const ownerUserId = this.useCases.assertDemoAccess(demoViewerId);

    const parsed = putViewerStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const body: PutViewerStateBody = parsed.data;

    const { revision } = await this.useCases.upsertViewerSnapshot({
      ownerUserId,
      state: body.state,
      expectedRevision: body.expectedRevision ?? null,
    });

    return { revision };
  }
}
