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

import { FixedHuntRoomsUseCases } from '../application/use-cases/fixed-hunt-rooms.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { FIXED_HUNT_ROOMS_USE_CASES, PLAYER_TEAM_ENV } from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';

const updateRoomBodySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  state: z.record(z.string(), z.unknown()),
});

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller('player-team/v1/fixed-hunt-rooms')
@UseFilters(PlayerTeamExceptionFilter)
export class FixedHuntRoomsController {
  public constructor(
    @Inject(FIXED_HUNT_ROOMS_USE_CASES) private readonly useCases: FixedHuntRoomsUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private viewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (value) => this.useCases.assertDemoAccess(value),
    });
  }

  @Get(':roomKey')
  public async getRoom(
    @Headers() headers: RequestHeaders,
    @Param('roomKey') roomKey: string,
  ) {
    await this.viewerId(headers);
    return this.useCases.getRoom(roomKey);
  }

  @Put(':roomKey')
  @HttpCode(200)
  public async updateRoom(
    @Headers() headers: RequestHeaders,
    @Param('roomKey') roomKey: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = updateRoomBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.updateRoom({
      roomKey,
      viewerId: await this.viewerId(headers),
      state: parsed.data.state,
      expectedRevision: parsed.data.expectedRevision,
    });
  }
}
