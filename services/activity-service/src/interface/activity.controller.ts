import {
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
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { ActorSubject } from '../application/ports/activity.ports.js';
import { ActivityUseCases } from '../application/use-cases/activity.use-cases.js';
import { ActivityError } from '../domain/errors.js';
import { ActivityExceptionFilter } from './activity-exception.filter.js';
import { ACTIVITY_USE_CASES } from './activity.tokens.js';
import {
  type AuthenticatedRequest,
  InboundAssertionGuard,
  RequireOperation,
} from './inbound-assertion.guard.js';

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ActivityError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid body');
  }
  return parsed.data;
}

function actorFromRequest(request: AuthenticatedRequest): ActorSubject {
  const actor = request.verifiedActor ?? {};
  if (actor.discordUserId === undefined && actor.v2UserId === undefined) {
    throw new ActivityError('UNAUTHENTICATED', 'Actor identity required');
  }
  return actor;
}

function mutationCtx(request: AuthenticatedRequest, idempotencyKey?: string) {
  return {
    actor: actorFromRequest(request),
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
}

const draftCreateSchema = z.object({
  guildId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const draftUpdateSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

const scheduleKindSchema = z.enum(['exact', 'range', 'flexible_period']);
const periodKeySchema = z.enum(['today', 'tomorrow', 'this_week', 'weekend', 'flexible']);

const publishSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  scheduleKind: scheduleKindSchema.optional(),
  periodKey: periodKeySchema.nullable().optional(),
  scheduleHasExplicitTime: z.boolean().optional(),
  participantLimit: z.number().int().positive().nullable().optional(),
  publicationChannelId: z.string().optional(),
  timezone: z.string().optional(),
  locationText: z.string().nullable().optional(),
  typeId: z.string().uuid().nullable().optional(),
  participantMode: z.enum(['shared', 'separate']).optional(),
  targets: z
    .array(
      z.object({
        guildId: z.string().min(1),
        channelId: z.string().min(1),
        participantLimit: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(25)
    .optional(),
  visibility: z.enum(['public', 'private']).optional(),
  privateRoleIds: z.array(z.string().min(1)).max(25).optional(),
});

const publishSeriesSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  firstStartAt: z.string().datetime(),
  endAtOffsetMs: z.number().int().nonnegative().nullable().optional(),
  recurrenceKind: z.enum(['daily', 'weekly', 'weekdays']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  horizonEndAt: z.string().datetime(),
  participantLimit: z.number().int().positive().nullable().optional(),
  publicationChannelId: z.string().optional(),
  timezone: z.string().optional(),
  locationText: z.string().nullable().optional(),
  typeId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  privateRoleIds: z.array(z.string().min(1)).max(25).optional(),
});

const editSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  participantLimit: z.number().int().positive().nullable().optional(),
  locationText: z.string().nullable().optional(),
  publicationChannelId: z.string().nullable().optional(),
  seriesScope: z.enum(['this', 'this_and_following']).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(1000),
  seriesScope: z.enum(['this', 'this_and_following', 'entire_series']).optional(),
});

const attendanceSchema = z.object({
  subjectDiscordUserId: z.string().min(1),
  status: z.enum(['present', 'absent']),
});

const rsvpSchema = z.object({
  statusDefId: z.string().uuid(),
  guildId: z.string().min(1).optional(),
  partyRoleKey: z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']).optional(),
});

const removeParticipantSchema = z.object({
  discordUserId: z.string().min(1),
  reason: z.string().min(1),
});

const coOrganizerSchema = z.object({
  discordUserId: z.string().min(1),
  v2UserId: z.string().optional(),
});

const rescheduleSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  scheduleKind: scheduleKindSchema.optional(),
  periodKey: periodKeySchema.nullable().optional(),
  scheduleHasExplicitTime: z.boolean().optional(),
  reconfirmDeadline: z.string().datetime().nullable().optional(),
});

const configUpdateSchema = z.object({
  organizerDefaultStatusId: z.string().uuid().nullable().optional(),
  waitlistPromotionStatusId: z.string().uuid().nullable().optional(),
  maxActivePerCreator: z.number().int().positive().optional(),
  registrationDefaultClosesAtStart: z.boolean().optional(),
});

const ensureDefaultsSchema = z.object({
  orgId: z.string().min(1),
});

const panelUpsertSchema = z.object({
  organizationId: z.string().min(1),
  discordGuildId: z.string().min(1),
  channelId: z.string().min(1),
  panelType: z.string().optional(),
  messageId: z.string().nullable().optional(),
  status: z.string().optional(),
  operationId: z.string().optional(),
  nonce: z.string().max(25).optional(),
  correlationId: z.string().optional(),
  occurrenceOutcome: z.enum(['sent', 'adopted']).optional(),
  incident: z
    .object({
      action: z.string().min(1),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const outboxClaimSchema = z.object({
  owner: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
  leaseSeconds: z.number().int().positive().max(300).optional(),
});

const outboxFailSchema = z.object({
  error: z.string().min(1),
});

const reportCreateSchema = z.object({
  reasonCategory: z.string().min(1).max(100),
  details: z.string().max(4000).nullable().optional(),
});

const projectionUpsertSchema = z.object({
  channelId: z.string().min(1),
  messageId: z.string().nullable().optional(),
  status: z.string().optional(),
  revision: z.number().int().positive().optional(),
  lastError: z.string().nullable().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  desiredPayloadVersion: z.number().int().positive().optional(),
  opaqueId: z.string().length(12).optional(),
});

const seedGuildSchema = z.object({
  guildId: z.string().min(1),
  orgId: z.string().min(1),
  channelId: z.string().min(1),
});

@Controller('activity/v1')
@UseGuards(InboundAssertionGuard)
@UseFilters(ActivityExceptionFilter)
export class ActivityController {
  public constructor(@Inject(ACTIVITY_USE_CASES) private readonly useCases: ActivityUseCases) {}

  @Post('drafts')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createDraft(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(draftCreateSchema, body);
    return this.useCases.createDraft(
      {
        guildId: parsed.guildId,
        ...(parsed.payload !== undefined ? { payload: parsed.payload } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('drafts/by-opaque/:opaqueId')
  @RequireOperation('activity_read')
  public async getDraftByOpaque(
    @Param('opaqueId') opaqueId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.getDraftByOpaque(opaqueId, actorFromRequest(request));
  }

  @Get('drafts/:id')
  @RequireOperation('activity_read')
  public async getDraft(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.getDraft(id, actorFromRequest(request));
  }

  @Patch('drafts/:id')
  @RequireOperation('activity_mutate')
  public async updateDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(draftUpdateSchema, body);
    return this.useCases.updateDraft(id, parsed.payload, mutationCtx(request, idempotencyKey));
  }

  @Delete('drafts/:id')
  @RequireOperation('activity_mutate')
  public async discardDraft(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.discardDraft(id, mutationCtx(request, idempotencyKey));
  }

  @Post('drafts/:id/publish')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async publishDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(publishSchema, body);
    return this.useCases.publishDraft(
      id,
      {
        organizationId: parsed.organizationId,
        name: parsed.name,
        startAt: new Date(parsed.startAt),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.endAt !== undefined
          ? { endAt: parsed.endAt === null ? null : new Date(parsed.endAt) }
          : {}),
        ...(parsed.scheduleKind !== undefined ? { scheduleKind: parsed.scheduleKind } : {}),
        ...(parsed.periodKey !== undefined ? { periodKey: parsed.periodKey } : {}),
        ...(parsed.scheduleHasExplicitTime !== undefined
          ? { scheduleHasExplicitTime: parsed.scheduleHasExplicitTime }
          : {}),
        ...(parsed.participantLimit !== undefined
          ? { participantLimit: parsed.participantLimit }
          : {}),
        ...(parsed.publicationChannelId !== undefined
          ? { publicationChannelId: parsed.publicationChannelId }
          : {}),
        ...(parsed.timezone !== undefined ? { timezone: parsed.timezone } : {}),
        ...(parsed.locationText !== undefined ? { locationText: parsed.locationText } : {}),
        ...(parsed.typeId !== undefined ? { typeId: parsed.typeId } : {}),
        ...(parsed.participantMode !== undefined
          ? { participantMode: parsed.participantMode }
          : {}),
        ...(parsed.targets !== undefined
          ? {
              targets: parsed.targets.map((t) => ({
                guildId: t.guildId,
                channelId: t.channelId,
                ...(t.participantLimit !== undefined
                  ? { participantLimit: t.participantLimit }
                  : {}),
              })),
            }
          : {}),
        ...(parsed.visibility !== undefined ? { visibility: parsed.visibility } : {}),
        ...(parsed.privateRoleIds !== undefined ? { privateRoleIds: parsed.privateRoleIds } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('drafts/:id/publish-series')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async publishSeriesDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(publishSeriesSchema, body);
    return this.useCases.publishSeriesDraft(
      id,
      {
        organizationId: parsed.organizationId,
        name: parsed.name,
        firstStartAt: new Date(parsed.firstStartAt),
        recurrenceKind: parsed.recurrenceKind,
        horizonEndAt: new Date(parsed.horizonEndAt),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.endAtOffsetMs !== undefined ? { endAtOffsetMs: parsed.endAtOffsetMs } : {}),
        ...(parsed.weekdays !== undefined ? { weekdays: parsed.weekdays } : {}),
        ...(parsed.participantLimit !== undefined
          ? { participantLimit: parsed.participantLimit }
          : {}),
        ...(parsed.publicationChannelId !== undefined
          ? { publicationChannelId: parsed.publicationChannelId }
          : {}),
        ...(parsed.timezone !== undefined ? { timezone: parsed.timezone } : {}),
        ...(parsed.locationText !== undefined ? { locationText: parsed.locationText } : {}),
        ...(parsed.typeId !== undefined ? { typeId: parsed.typeId } : {}),
        ...(parsed.visibility !== undefined ? { visibility: parsed.visibility } : {}),
        ...(parsed.privateRoleIds !== undefined ? { privateRoleIds: parsed.privateRoleIds } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('activities')
  @RequireOperation('activity_read')
  public async listActivities(
    @Query('guildId') guildId: string,
    @Query('memberRoleIds') memberRoleIdsRaw: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim() === '') {
      throw new ActivityError('VALIDATION_FAILED', 'guildId query is required');
    }
    const memberRoleIds =
      memberRoleIdsRaw === undefined || memberRoleIdsRaw.trim() === ''
        ? undefined
        : memberRoleIdsRaw
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    return this.useCases.listActivities(
      guildId,
      actorFromRequest(request),
      memberRoleIds === undefined ? undefined : { memberRoleIds },
    );
  }

  @Get('activities/by-opaque/:opaqueId')
  @RequireOperation('activity_read')
  public async getActivityByOpaque(
    @Param('opaqueId') opaqueId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.getActivityByOpaqueId(opaqueId, actorFromRequest(request));
  }

  @Get('activities/:id')
  @RequireOperation('activity_read')
  public async getActivity(
    @Param('id') id: string,
    @Query('inviteToken') inviteToken: string | undefined,
    @Query('memberRoleIds') memberRoleIdsRaw: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const memberRoleIds =
      memberRoleIdsRaw === undefined || memberRoleIdsRaw.trim() === ''
        ? undefined
        : memberRoleIdsRaw
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    return this.useCases.getActivity(id, actorFromRequest(request), {
      ...(inviteToken !== undefined ? { inviteToken } : {}),
      ...(memberRoleIds !== undefined ? { memberRoleIds } : {}),
    });
  }

  @Get('series/:id')
  @RequireOperation('activity_read')
  public async getSeries(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.getSeries(id, actorFromRequest(request));
  }

  @Patch('activities/:id')
  @RequireOperation('activity_mutate')
  public async editActivity(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(editSchema, body);
    return this.useCases.editActivity(
      id,
      {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.participantLimit !== undefined
          ? { participantLimit: parsed.participantLimit }
          : {}),
        ...(parsed.locationText !== undefined ? { locationText: parsed.locationText } : {}),
        ...(parsed.publicationChannelId !== undefined
          ? { publicationChannelId: parsed.publicationChannelId }
          : {}),
      },
      mutationCtx(request, idempotencyKey),
      parsed.seriesScope ?? 'this',
    );
  }

  @Post('activities/:id/cancel')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async cancelActivity(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(cancelSchema, body);
    return this.useCases.cancelActivity(
      id,
      parsed.reason,
      mutationCtx(request, idempotencyKey),
      parsed.seriesScope ?? 'this',
    );
  }

  @Post('activities/:id/attendance')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async markAttendance(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(attendanceSchema, body);
    return this.useCases.markAttendance(
      id,
      {
        subjectDiscordUserId: parsed.subjectDiscordUserId,
        status: parsed.status,
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('activities/:id/attendance')
  @RequireOperation('activity_read')
  public async listAttendance(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.listAttendance(id, actorFromRequest(request));
  }

  @Get('guilds/:guildId/stats/self')
  @RequireOperation('activity_read')
  public async getSelfStats(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.getSelfStats(guildId, actorFromRequest(request));
  }

  @Get('guilds/:guildId/stats')
  @RequireOperation('activity_read')
  public async getGuildStats(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.getGuildStats(guildId, actorFromRequest(request));
  }

  @Delete('activities/:id')
  @RequireOperation('activity_mutate')
  public async deleteActivity(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.deleteActivity(id, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/enrollment/open')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async openEnrollment(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.openEnrollment(id, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/enrollment/close')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async closeEnrollment(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.closeEnrollment(id, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/rsvp')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async rsvp(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(rsvpSchema, body);
    return this.useCases.rsvp(
      id,
      {
        statusDefId: parsed.statusDefId,
        ...(parsed.guildId !== undefined ? { guildId: parsed.guildId } : {}),
        ...(parsed.partyRoleKey !== undefined ? { partyRoleKey: parsed.partyRoleKey } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('activities/:id/resign')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async resign(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.resign(id, mutationCtx(request, idempotencyKey));
  }

  @Get('activities/:id/participants')
  @RequireOperation('activity_read')
  public async listParticipants(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.listParticipants(id, actorFromRequest(request));
  }

  @Post('activities/:id/participants/remove')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async removeParticipant(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(removeParticipantSchema, body);
    return this.useCases.removeParticipant(id, parsed, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/co-organizer')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async assignCoOrganizer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(coOrganizerSchema, body);
    return this.useCases.assignCoOrganizer(
      id,
      {
        discordUserId: parsed.discordUserId,
        ...(parsed.v2UserId !== undefined ? { v2UserId: parsed.v2UserId } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('activities/:id/takeover')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async takeover(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.takeover(id, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/start')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async start(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.startActivity(id, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/finish')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async finish(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.finishActivity(id, mutationCtx(request, idempotencyKey));
  }

  @Post('activities/:id/reschedule')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async reschedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(rescheduleSchema, body);
    return this.useCases.reschedule(
      id,
      {
        startAt: new Date(parsed.startAt),
        ...(parsed.endAt !== undefined
          ? { endAt: parsed.endAt === null ? null : new Date(parsed.endAt) }
          : {}),
        ...(parsed.scheduleKind !== undefined ? { scheduleKind: parsed.scheduleKind } : {}),
        ...(parsed.periodKey !== undefined ? { periodKey: parsed.periodKey } : {}),
        ...(parsed.scheduleHasExplicitTime !== undefined
          ? { scheduleHasExplicitTime: parsed.scheduleHasExplicitTime }
          : {}),
        ...(parsed.reconfirmDeadline !== undefined
          ? {
              reconfirmDeadline:
                parsed.reconfirmDeadline === null ? null : new Date(parsed.reconfirmDeadline),
            }
          : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('activities/:id/reconfirm')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async reconfirm(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.reconfirm(id, mutationCtx(request, idempotencyKey));
  }

  @Post('maintenance/expire-reconfirmations')
  @HttpCode(200)
  @RequireOperation('activity_maintenance')
  public async expireReconfirmations(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const schema = z.object({ activityId: z.string().uuid().optional() });
    const parsed = parseOrThrow(schema, body ?? {});
    if (parsed.activityId !== undefined) {
      return this.useCases.expireReconfirmationsForActivity(
        parsed.activityId,
        mutationCtx(request, idempotencyKey),
      );
    }
    return this.useCases.expireReconfirmations(mutationCtx(request, idempotencyKey));
  }

  @Post('maintenance/finish-due')
  @HttpCode(200)
  @RequireOperation('activity_maintenance')
  public async finishDue(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.finishDue(mutationCtx(request, idempotencyKey));
  }

  @Get('guilds/:guildId/config')
  @RequireOperation('activity_read')
  public async getConfig(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.getGuildConfig(guildId, actorFromRequest(request));
  }

  @Put('guilds/:guildId/config')
  @RequireOperation('activity_mutate')
  public async putConfig(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(configUpdateSchema, body);
    return this.useCases.updateGuildConfig(
      guildId,
      {
        ...(parsed.organizerDefaultStatusId !== undefined
          ? { organizerDefaultStatusId: parsed.organizerDefaultStatusId }
          : {}),
        ...(parsed.waitlistPromotionStatusId !== undefined
          ? { waitlistPromotionStatusId: parsed.waitlistPromotionStatusId }
          : {}),
        ...(parsed.maxActivePerCreator !== undefined
          ? { maxActivePerCreator: parsed.maxActivePerCreator }
          : {}),
        ...(parsed.registrationDefaultClosesAtStart !== undefined
          ? { registrationDefaultClosesAtStart: parsed.registrationDefaultClosesAtStart }
          : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('guilds/:guildId/ensure-defaults')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async ensureDefaults(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(ensureDefaultsSchema, body);
    return this.useCases.ensureGuildDefaults(
      guildId,
      parsed.orgId,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('panels')
  @RequireOperation('activity_read')
  public async listPanels(@Query('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    if (guildId === undefined || guildId.trim() === '') {
      throw new ActivityError('VALIDATION_FAILED', 'guildId query is required');
    }
    return this.useCases.listPanels(guildId, actorFromRequest(request));
  }

  @Get('panels/by-opaque/:opaqueId')
  @RequireOperation('activity_read')
  public async getPanelByOpaque(
    @Param('opaqueId') opaqueId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.getPanelByOpaqueId(opaqueId, actorFromRequest(request));
  }

  @Get('panels/:id')
  @RequireOperation('activity_read')
  public async getPanel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.getPanel(id, actorFromRequest(request));
  }

  @Post('panels')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async upsertPanel(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(panelUpsertSchema, body);
    return this.useCases.upsertPanel(
      {
        organizationId: parsed.organizationId,
        discordGuildId: parsed.discordGuildId,
        channelId: parsed.channelId,
        ...(parsed.panelType !== undefined ? { panelType: parsed.panelType } : {}),
        ...(parsed.messageId !== undefined ? { messageId: parsed.messageId } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.operationId !== undefined ? { operationId: parsed.operationId } : {}),
        ...(parsed.nonce !== undefined ? { nonce: parsed.nonce } : {}),
        ...(parsed.correlationId !== undefined ? { correlationId: parsed.correlationId } : {}),
        ...(parsed.occurrenceOutcome !== undefined
          ? { occurrenceOutcome: parsed.occurrenceOutcome }
          : {}),
        ...(parsed.incident !== undefined
          ? {
              incident: {
                action: parsed.incident.action,
                ...(parsed.incident.details !== undefined
                  ? { details: parsed.incident.details }
                  : {}),
              },
            }
          : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('panels/:id/pending-occurrence')
  @RequireOperation('activity_read')
  public async getPanelPendingOccurrence(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.getPanelPendingOccurrence(id, actorFromRequest(request));
  }

  @Post('outbox/claim')
  @HttpCode(200)
  @RequireOperation('activity_outbox')
  public async claimOutbox(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(outboxClaimSchema, body);
    return this.useCases.claimOutbox(
      {
        owner: parsed.owner,
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        ...(parsed.leaseSeconds !== undefined ? { leaseSeconds: parsed.leaseSeconds } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('outbox/:id/complete')
  @HttpCode(200)
  @RequireOperation('activity_outbox')
  public async completeOutbox(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.useCases.completeOutbox(id, mutationCtx(request, idempotencyKey));
  }

  @Post('outbox/:id/fail')
  @HttpCode(200)
  @RequireOperation('activity_outbox')
  public async failOutbox(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(outboxFailSchema, body);
    return this.useCases.failOutbox(id, parsed.error, mutationCtx(request, idempotencyKey));
  }

  @Get('me/activities')
  @RequireOperation('activity_read')
  public async myActivities(
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.listMyActivities(actorFromRequest(request), guildId);
  }

  @Get('inbox')
  @RequireOperation('activity_read')
  public async listInbox(
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const limit =
      limitRaw === undefined || limitRaw.trim() === '' ? undefined : Number.parseInt(limitRaw, 10);
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      throw new ActivityError('VALIDATION_FAILED', 'limit must be a positive integer');
    }
    return this.useCases.listInbox(actorFromRequest(request), {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
  }

  @Post('inbox/:id/read')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async markInboxRead(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.markInboxRead(id, actorFromRequest(request));
  }

  @Get('notifications/preferences')
  @RequireOperation('activity_read')
  public async getNotificationPreferences(
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.useCases.getNotificationPreferences(actorFromRequest(request), guildId.trim());
  }

  @Put('notifications/preferences')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async updateNotificationPreferences(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = parseOrThrow(
      z.object({
        guildId: z.string().min(1),
        dmEnabled: z.boolean().optional(),
        mutedInterestKeys: z.array(z.string().min(1)).optional(),
        mutedActivityTypeKeys: z.array(z.string().min(1)).optional(),
        mutedActivityIds: z.array(z.string().uuid()).optional(),
      }),
      body,
    );
    return this.useCases.updateNotificationPreferences(actorFromRequest(request), parsed.guildId, {
      ...(parsed.dmEnabled !== undefined ? { dmEnabled: parsed.dmEnabled } : {}),
      ...(parsed.mutedInterestKeys !== undefined
        ? { mutedInterestKeys: parsed.mutedInterestKeys }
        : {}),
      ...(parsed.mutedActivityTypeKeys !== undefined
        ? { mutedActivityTypeKeys: parsed.mutedActivityTypeKeys }
        : {}),
      ...(parsed.mutedActivityIds !== undefined
        ? { mutedActivityIds: parsed.mutedActivityIds }
        : {}),
    });
  }

  @Post('lfg/search')
  @HttpCode(200)
  @RequireOperation('activity_read')
  public async searchLfg(
    @Body() body: unknown,
    @Query('memberRoleIds') memberRoleIdsRaw: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const partyRole = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);
    const parsed = parseOrThrow(
      z
        .object({
          guildId: z.string().min(1),
          organizationId: z.string().min(1),
          activityTypeKey: z.string().min(1),
          characterId: z.string().uuid(),
          sessionRoles: z.array(partyRole).min(1),
          windowStartAt: z.string().datetime(),
          windowEndAt: z.string().datetime(),
        })
        .refine((value) => new Date(value.windowEndAt) > new Date(value.windowStartAt), {
          message: 'windowEndAt must be after windowStartAt',
        }),
      body,
    );
    const memberRoleIds =
      memberRoleIdsRaw === undefined || memberRoleIdsRaw.trim() === ''
        ? undefined
        : memberRoleIdsRaw
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    return this.useCases.searchLfg(actorFromRequest(request), {
      ...parsed,
      ...(memberRoleIds !== undefined ? { memberRoleIds } : {}),
    });
  }

  @Post('lfg/watches')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createLfgWatch(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const partyRole = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);
    const parsed = parseOrThrow(
      z
        .object({
          guildId: z.string().min(1),
          organizationId: z.string().min(1),
          characterId: z.string().uuid(),
          activityTypeKey: z.string().min(1),
          sessionRoles: z.array(partyRole).min(1),
          windowStartAt: z.string().datetime(),
          windowEndAt: z.string().datetime(),
        })
        .refine((value) => new Date(value.windowEndAt) > new Date(value.windowStartAt), {
          message: 'windowEndAt must be after windowStartAt',
        }),
      body,
    );
    return this.useCases.createLfgWatch(actorFromRequest(request), {
      guildId: parsed.guildId,
      organizationId: parsed.organizationId,
      characterId: parsed.characterId,
      activityTypeKey: parsed.activityTypeKey,
      sessionRoles: parsed.sessionRoles,
      windowStartAt: parsed.windowStartAt,
      windowEndAt: parsed.windowEndAt,
    });
  }

  @Patch('lfg/watches/:id')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async updateLfgWatch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const partyRole = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);
    const parsed = parseOrThrow(
      z
        .object({
          guildId: z.string().min(1),
          sessionRoles: z.array(partyRole).min(1),
          windowStartAt: z.string().datetime(),
          windowEndAt: z.string().datetime(),
        })
        .refine((value) => new Date(value.windowEndAt) > new Date(value.windowStartAt), {
          message: 'windowEndAt must be after windowStartAt',
        }),
      body,
    );
    return this.useCases.updateLfgWatch(actorFromRequest(request), id, parsed);
  }

  @Get('lfg/watches')
  @RequireOperation('activity_read')
  public async listLfgWatches(
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.useCases.listMyLfgWatches(actorFromRequest(request), guildId.trim());
  }

  @Post('lfg/watches/:id/cancel')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async cancelLfgWatch(
    @Param('id') id: string,
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.useCases.cancelLfgWatch(actorFromRequest(request), id, guildId.trim());
  }

  @Post('lfg/join')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async joinLfg(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const partyRole = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);
    const parsed = parseOrThrow(
      z.object({
        activityId: z.string().uuid(),
        statusDefId: z.string().uuid(),
        partyRoleKey: partyRole,
        guildId: z.string().min(1).optional(),
        intentId: z.string().uuid().optional(),
        characterId: z.string().uuid().optional(),
      }),
      body,
    );
    return this.useCases.joinLfg(
      actorFromRequest(request),
      {
        activityId: parsed.activityId,
        statusDefId: parsed.statusDefId,
        partyRoleKey: parsed.partyRoleKey,
        ...(parsed.guildId !== undefined ? { guildId: parsed.guildId } : {}),
        ...(parsed.intentId !== undefined ? { intentId: parsed.intentId } : {}),
        ...(parsed.characterId !== undefined ? { characterId: parsed.characterId } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('lfg/full-group-watches')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createLfgFullGroupWatch(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const partyRole = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);
    const parsed = parseOrThrow(
      z.object({
        guildId: z.string().min(1),
        organizationId: z.string().min(1),
        activityId: z.string().uuid(),
        characterId: z.string().uuid(),
        sessionRoles: z.array(partyRole).min(1),
      }),
      body,
    );
    return this.useCases.createLfgFullGroupWatch(actorFromRequest(request), parsed);
  }

  @Post('lfg/full-group-watches/:id/cancel')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async cancelLfgFullGroupWatch(
    @Param('id') id: string,
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.useCases.cancelLfgFullGroupWatch(actorFromRequest(request), id, guildId.trim());
  }

  @Get('lfg/activities/by-opaque/:opaqueId')
  @RequireOperation('activity_read')
  public async resolveLfgActivityByOpaque(
    @Param('opaqueId') opaqueId: string,
    @Query('memberRoleIds') memberRoleIdsRaw: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const memberRoleIds =
      memberRoleIdsRaw === undefined || memberRoleIdsRaw.trim() === ''
        ? undefined
        : memberRoleIdsRaw
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    return this.useCases.resolveLfgActivityByOpaque(
      opaqueId,
      actorFromRequest(request),
      ...(memberRoleIds !== undefined ? [{ memberRoleIds }] : []),
    );
  }

  @Post('lfg/watches/:id/pause')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async pauseLfgWatch(
    @Param('id') id: string,
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.useCases.pauseLfgWatch(actorFromRequest(request), id, guildId.trim());
  }

  @Post('lfg/watches/:id/resume')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async resumeLfgWatch(
    @Param('id') id: string,
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.useCases.resumeLfgWatch(actorFromRequest(request), id, guildId.trim());
  }

  @Post('lfg/matches/:activityId/suppress')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async suppressLfgMatch(
    @Param('activityId') activityId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = parseOrThrow(
      z.object({
        intentId: z.string().uuid().optional(),
        guildId: z.string().min(1),
      }),
      body,
    );
    return this.useCases.suppressLfgMatch(actorFromRequest(request), activityId, {
      guildId: parsed.guildId,
      ...(parsed.intentId !== undefined ? { intentId: parsed.intentId } : {}),
    });
  }

  @Post('reservations')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createReservation(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(
      z.object({
        guildId: z.string().min(1),
        organizationId: z.string().min(1),
        resourceId: z.string().uuid(),
        spotId: z.string().uuid(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }),
      body,
    );
    return this.useCases.createReservation(actorFromRequest(request), parsed);
  }

  @Post('marketplace/offers')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createMarketplaceOffer(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = parseOrThrow(
      z.object({
        guildId: z.string().min(1),
        organizationId: z.string().min(1),
        side: z.enum(['BUY', 'SELL']),
        categoryKey: z.string().min(1),
        itemLabel: z.string().min(1).max(200),
        priceAmount: z.number().nonnegative().nullable().optional(),
        budgetAmount: z.number().nonnegative().nullable().optional(),
        quantity: z.number().int().positive().default(1),
        description: z.string().max(2000).default(''),
        expiresAt: z.string().datetime().nullable().optional(),
      }),
      body,
    );
    return this.useCases.createMarketplaceOffer(actorFromRequest(request), {
      guildId: parsed.guildId,
      organizationId: parsed.organizationId,
      side: parsed.side,
      categoryKey: parsed.categoryKey,
      itemLabel: parsed.itemLabel,
      quantity: parsed.quantity,
      description: parsed.description,
      ...(parsed.priceAmount !== undefined ? { priceAmount: parsed.priceAmount } : {}),
      ...(parsed.budgetAmount !== undefined ? { budgetAmount: parsed.budgetAmount } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
    });
  }

  @Post('activities/:id/reports')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createReport(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(reportCreateSchema, body);
    return this.useCases.createReport(
      id,
      {
        reasonCategory: parsed.reasonCategory,
        ...(parsed.details !== undefined ? { details: parsed.details } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/reports')
  @RequireOperation('activity_read')
  public async listReports(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.useCases.listReports(guildId, actorFromRequest(request));
  }

  @Put('activities/:id/projection')
  @RequireOperation('activity_mutate')
  public async upsertProjection(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(projectionUpsertSchema, body);
    return this.useCases.upsertActivityProjection(
      id,
      {
        channelId: parsed.channelId,
        ...(parsed.messageId !== undefined ? { messageId: parsed.messageId } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.revision !== undefined ? { revision: parsed.revision } : {}),
        ...(parsed.lastError !== undefined ? { lastError: parsed.lastError } : {}),
        ...(parsed.retryCount !== undefined ? { retryCount: parsed.retryCount } : {}),
        ...(parsed.desiredPayloadVersion !== undefined
          ? { desiredPayloadVersion: parsed.desiredPayloadVersion }
          : {}),
        ...(parsed.opaqueId !== undefined ? { opaqueId: parsed.opaqueId } : {}),
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('activities/:id/projection')
  @RequireOperation('activity_read')
  public async getProjection(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.getActivityProjection(id, actorFromRequest(request));
  }

  @Post('test/seed-guild')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async seedTestGuild(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(seedGuildSchema, body);
    return this.useCases.seedTestGuild(parsed, mutationCtx(request, idempotencyKey));
  }
}
