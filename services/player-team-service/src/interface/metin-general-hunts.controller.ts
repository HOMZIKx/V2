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
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { MetinGeneralHuntsUseCases } from '../application/use-cases/metin-general-hunts.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { METIN_GENERAL_HUNTS_USE_CASES, PLAYER_TEAM_ENV } from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';

const updateHuntBodySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  state: z.record(z.string(), z.unknown()),
});

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller('player-team/v1/metin-general-hunts')
@UseFilters(PlayerTeamExceptionFilter)
export class MetinGeneralHuntsController {
  public constructor(
    @Inject(METIN_GENERAL_HUNTS_USE_CASES) private readonly useCases: MetinGeneralHuntsUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private viewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (value) => this.useCases.assertDemoAccess(value),
    });
  }

  @Get(':huntKey')
  public async getHunt(
    @Headers() headers: RequestHeaders,
    @Param('huntKey') huntKey: string,
  ) {
    await this.viewerId(headers);
    return this.useCases.getHunt(huntKey);
  }

  @Put(':huntKey')
  @HttpCode(200)
  public async updateHunt(
    @Headers() headers: RequestHeaders,
    @Param('huntKey') huntKey: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = updateHuntBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.updateHunt({
      huntKey,
      viewerId: await this.viewerId(headers),
      state: parsed.data.state,
      expectedRevision: parsed.data.expectedRevision,
    });
  }
}
