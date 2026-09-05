import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { HuntRoomsUseCases } from '../application/use-cases/hunt-rooms.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { HUNT_ROOMS_USE_CASES, PLAYER_TEAM_ENV } from './player-team.tokens.js';

const createPartyBodySchema = z.object({
  displayName: z.string().min(1),
  mapKey: z.string().min(1),
  activeChannel: z.number().int().positive().default(1),
  visibility: z.enum(['open', 'closed']),
});

const joinPartyBodySchema = z.object({
  displayName: z.string().min(1),
  joinCode: z.string().min(1),
});

const patchPartyBodySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  mapKey: z.string().min(1).optional(),
  activeChannel: z.number().int().positive().optional(),
  sessionKills: z.number().int().nonnegative().optional(),
  visibility: z.enum(['open', 'closed']).optional(),
});

const pinSchema = z.object({
  id: z.string().min(1),
  partyId: z.string().optional(),
  mapKey: z.string().min(1),
  channel: z.number().int().positive(),
  location: z.object({ x: z.number(), y: z.number() }),
  placedAt: z.number(),
  placedBy: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['metin', 'boss', 'spot']),
});

const addPinBodySchema = z.object({
  pin: pinSchema,
});

const confirmKillBodySchema = z.object({
  roomCode: z.string().nullable().optional(),
  operationId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative().optional(),
  record: z.object({
    key: z.string().min(1),
    mapKey: z.string().min(1),
    channel: z.number().int().positive(),
    kind: z.enum(['boss', 'metin']),
    entityName: z.string().optional(),
    confirmedAt: z.number().nullable(),
    confirmedBy: z.string().nullable(),
    location: z.object({ x: z.number(), y: z.number() }).nullable(),
    operationId: z.string().nullable().optional(),
  }),
});

@Controller('player-team/v1')
@UseFilters(PlayerTeamExceptionFilter)
export class HuntRoomsController {
  public constructor(
    @Inject(HUNT_ROOMS_USE_CASES) private readonly useCases: HuntRoomsUseCases,
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

  @Post('party-rooms')
  @HttpCode(200)
  public async createPartyRoom(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() rawBody: unknown,
  ) {
    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const parsed = createPartyBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.createPartyRoom({
      leaderId: viewerId,
      displayName: parsed.data.displayName,
      mapKey: parsed.data.mapKey,
      activeChannel: parsed.data.activeChannel,
      visibility: parsed.data.visibility,
    });
  }

  @Post('party-rooms/join')
  @HttpCode(200)
  public async joinPartyRoom(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() rawBody: unknown,
  ) {
    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const parsed = joinPartyBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.joinPartyRoom({
      viewerId,
      displayName: parsed.data.displayName,
      joinCode: parsed.data.joinCode,
    });
  }

  @Get('party-rooms/:roomId')
  public async getPartyRoom(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('roomId') roomId: string,
  ) {
    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    return this.useCases.getPartyRoom(roomId);
  }

  @Post('party-rooms/:roomId/leave')
  @HttpCode(200)
  public async leavePartyRoom(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('roomId') roomId: string,
  ) {
    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const room = await this.useCases.leavePartyRoom(roomId, viewerId);
    return { ok: true as const, room };
  }

  @Patch('party-rooms/:roomId')
  public async patchPartyRoom(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('roomId') roomId: string,
    @Body() rawBody: unknown,
  ) {
    const viewerId = this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const parsed = patchPartyBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.patchPartyRoom({
      roomId,
      viewerId,
      expectedRevision: parsed.data.expectedRevision,
      ...(parsed.data.mapKey !== undefined ? { mapKey: parsed.data.mapKey } : {}),
      ...(parsed.data.activeChannel !== undefined
        ? { activeChannel: parsed.data.activeChannel }
        : {}),
      ...(parsed.data.sessionKills !== undefined
        ? { sessionKills: parsed.data.sessionKills }
        : {}),
      ...(parsed.data.visibility !== undefined
        ? { visibility: parsed.data.visibility }
        : {}),
    });
  }

  @Post('party-rooms/:roomId/pins')
  @HttpCode(200)
  public async addPin(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('roomId') roomId: string,
    @Body() rawBody: unknown,
  ) {
    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const parsed = addPinBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    const pin = parsed.data.pin;
    return this.useCases.addPartyRoomPin(roomId, {
      ...pin,
      partyId: pin.partyId ?? roomId,
    });
  }

  @Delete('party-rooms/:roomId/pins/:pinId')
  public async removePin(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('roomId') roomId: string,
    @Param('pinId') pinId: string,
  ) {
    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    return this.useCases.removePartyRoomPin(roomId, pinId);
  }

  @Get('timer-rooms/:mapKey/:channel')
  public async getTimerRoom(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('mapKey') mapKey: string,
    @Param('channel') channelRaw: string,
    @Query('roomCode') roomCode?: string,
  ) {
    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const channel = Number(channelRaw);
    if (!Number.isFinite(channel) || channel < 1) {
      throw new BadRequestException('invalid channel');
    }
    return this.useCases.getOrCreateTimerRoom(mapKey, channel, roomCode ?? null);
  }

  @Post('timer-rooms/:mapKey/:channel/confirm-kill')
  @HttpCode(200)
  public async confirmKill(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('mapKey') mapKey: string,
    @Param('channel') channelRaw: string,
    @Body() rawBody: unknown,
  ) {
    this.useCases.assertDemoAccess(this.demoViewerIdFromHeaders(headers));
    const channel = Number(channelRaw);
    if (!Number.isFinite(channel) || channel < 1) {
      throw new BadRequestException('invalid channel');
    }
    const parsed = confirmKillBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    const record = parsed.data.record;
    return this.useCases.confirmTimerKill({
      mapKey,
      channel,
      roomCode: parsed.data.roomCode ?? null,
      record: {
        key: record.key,
        mapKey: record.mapKey,
        channel: record.channel,
        kind: record.kind,
        confirmedAt: record.confirmedAt,
        confirmedBy: record.confirmedBy,
        location: record.location,
        ...(record.entityName !== undefined ? { entityName: record.entityName } : {}),
        ...(record.operationId !== undefined && record.operationId !== null
          ? { operationId: record.operationId }
          : {}),
      },
      operationId: parsed.data.operationId,
      expectedRevision: parsed.data.expectedRevision ?? null,
    });
  }
}
