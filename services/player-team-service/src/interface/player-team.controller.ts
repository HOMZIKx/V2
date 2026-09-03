import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Put,
} from '@nestjs/common';
import { z } from 'zod';

import { PlayerTeamStateService } from '../application/player-team-state.service.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PLAYER_TEAM_ENV } from './player-team.tokens.js';

const putViewerStateBodySchema = z.object({
  state: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative().optional(),
});

type PutViewerStateBody = z.infer<typeof putViewerStateBodySchema>;

@Controller('player-team/v1')
export class PlayerTeamController {
  public constructor(
    private readonly service: PlayerTeamStateService,
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
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue: demoViewerId });

    const record = await this.service.getViewerSnapshotOrNull({ ownerUserId });
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
    const ownerUserId = this.service.assertDemoAccessOrThrow({ demoHeaderValue: demoViewerId });

    const parsed = putViewerStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const body: PutViewerStateBody = parsed.data;

    try {
      const { revision } = await this.service.upsertViewerSnapshot({
        ownerUserId,
        state: body.state,
        expectedRevision: body.expectedRevision ?? null,
      });

      return { revision };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        'actual' in err &&
        (err as Record<string, unknown>)['code'] === 'REVISION_CONFLICT'
      ) {
        const actual = (err as Record<string, unknown>)['actual'] as number | null;
        throw new ConflictException(
          `snapshot revision conflict: expected ${body.expectedRevision}, actual ${actual}`,
        );
      }
      throw err;
    }
  }
}
