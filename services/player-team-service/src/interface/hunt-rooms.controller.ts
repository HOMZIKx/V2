import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
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
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';

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

const partyRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'rejected']),
});

const patchPartyBodySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  mapKey: z.string().min(1).optional(),
  activeChannel: z.number().int().positive().optional(),
  sessionKills: z.number().int().nonnegative().optional(),
  sessionKillsDelta: z.literal(1).optional(),
  visibility: z.enum(['open', 'closed']).optional(),
  requests: z.array(partyRequestSchema).max(100).optional(),
});

const huntRoleBodySchema = z.object({
  huntRole: z.enum(['scout', 'hunter']),
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
  claimedBy: z.string().min(1).nullable().optional(),
  claimedAt: z.number().nullable().optional(),
  completedBy: z.string().min(1).nullable().optional(),
  completedAt: z.number().nullable().optional(),
});

const patchPinBodySchema = z
  .object({
    claimedBy: z.string().min(1).nullable().optional(),
    claimedAt: z.number().nullable().optional(),
    completedBy: z.string().min(1).nullable().optional(),
    completedAt: z.number().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'pin patch cannot be empty' });

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

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller('player-team/v1')
@UseFilters(PlayerTeamExceptionFilter)
export class HuntRoomsController {
  public constructor(
    @Inject(HUNT_ROOMS_USE_CASES) private readonly useCases: HuntRoomsUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private resolveViewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (demoViewerId) => this.useCases.assertDemoAccess(demoViewerId),
    });
  }

  @Post('party-rooms')
  @HttpCode(200)
  public async createPartyRoom(
    @Headers() headers: RequestHeaders,
    @Body() rawBody: unknown,
  ) {
    const viewerId = await this.resolveViewerId(headers);
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
    @Headers() headers: RequestHeaders,
    @Body() rawBody: unknown,
  ) {
    const viewerId = await this.resolveViewerId(headers);
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
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
  ) {
    const viewerId = await this.resolveViewerId(headers);
    const room = await this.useCases.getPartyRoom(roomId, viewerId);
    if (room === null) throw new NotFoundException('party room not found');
    return room;
  }

  @Post('party-rooms/:roomId/leave')
  @HttpCode(200)
  public async leavePartyRoom(
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
  ) {
    const viewerId = await this.resolveViewerId(headers);
    const room = await this.useCases.leavePartyRoom(roomId, viewerId);
    return { ok: true as const, room };
  }

  @Patch('party-rooms/:roomId')
  public async patchPartyRoom(
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
    @Body() rawBody: unknown,
  ) {
    const viewerId = await this.resolveViewerId(headers);
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
      ...(parsed.data.sessionKills !== undefined ? { sessionKills: parsed.data.sessionKills } : {}),
      ...(parsed.data.sessionKillsDelta !== undefined
        ? { sessionKillsDelta: parsed.data.sessionKillsDelta }
        : {}),
      ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
      ...(parsed.data.requests !== undefined ? { requests: parsed.data.requests } : {}),
    });
  }

  @Patch('party-rooms/:roomId/hunt-role')
  public async setHuntRole(
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
    @Body() rawBody: unknown,
  ) {
    const viewerId = await this.resolveViewerId(headers);
    const parsed = huntRoleBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.setPartyHuntRole({
      roomId,
      viewerId,
      huntRole: parsed.data.huntRole,
    });
  }

  @Post('party-rooms/:roomId/pins')
  @HttpCode(200)
  public async addPin(
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
    @Body() rawBody: unknown,
  ) {
    const viewerId = await this.resolveViewerId(headers);
    const parsed = addPinBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    const pin = parsed.data.pin;
    return this.useCases.addPartyRoomPin(roomId, viewerId, {
      ...pin,
      partyId: pin.partyId ?? roomId,
    });
  }

  @Patch('party-rooms/:roomId/pins/:pinId')
  public async patchPin(
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
    @Param('pinId') pinId: string,
    @Body() rawBody: unknown,
  ) {
    const viewerId = await this.resolveViewerId(headers);
    const parsed = patchPinBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return this.useCases.patchPartyRoomPin({
      roomId,
      viewerId,
      pinId,
      ...(parsed.data.claimedBy !== undefined ? { claimedBy: parsed.data.claimedBy } : {}),
      ...(parsed.data.claimedAt !== undefined ? { claimedAt: parsed.data.claimedAt } : {}),
      ...(parsed.data.completedBy !== undefined ? { completedBy: parsed.data.completedBy } : {}),
      ...(parsed.data.completedAt !== undefined ? { completedAt: parsed.data.completedAt } : {}),
    });
  }

  @Delete('party-rooms/:roomId/pins/:pinId')
  public async removePin(
    @Headers() headers: RequestHeaders,
    @Param('roomId') roomId: string,
    @Param('pinId') pinId: string,
  ) {
    const viewerId = await this.resolveViewerId(headers);
    return this.useCases.removePartyRoomPin(roomId, viewerId, pinId);
  }

  @Get('timer-rooms/:mapKey/:channel')
  public async getTimerRoom(
    @Headers() headers: RequestHeaders,
    @Param('mapKey') mapKey: string,
    @Param('channel') channelRaw: string,
    @Query('roomCode') roomCode?: string,
  ) {
    await this.resolveViewerId(headers);
    const channel = Number(channelRaw);
    if (!Number.isFinite(channel) || channel < 1) {
      throw new BadRequestException('invalid channel');
    }
    return this.useCases.getOrCreateTimerRoom(mapKey, channel, roomCode ?? null);
  }

  @Post('timer-rooms/:mapKey/:channel/confirm-kill')
  @HttpCode(200)
  public async confirmKill(
    @Headers() headers: RequestHeaders,
    @Param('mapKey') mapKey: string,
    @Param('channel') channelRaw: string,
    @Body() rawBody: unknown,
  ) {
    await this.resolveViewerId(headers);
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
