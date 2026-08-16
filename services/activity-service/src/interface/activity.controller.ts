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
});

const editSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  participantLimit: z.number().int().positive().nullable().optional(),
  locationText: z.string().nullable().optional(),
  publicationChannelId: z.string().nullable().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(1000),
});

const rsvpSchema = z.object({
  statusDefId: z.string().uuid(),
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
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('activities')
  @RequireOperation('activity_read')
  public async listActivities(
    @Query('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (guildId === undefined || guildId.trim() === '') {
      throw new ActivityError('VALIDATION_FAILED', 'guildId query is required');
    }
    return this.useCases.listActivities(guildId, actorFromRequest(request));
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
  public async getActivity(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.getActivity(id, actorFromRequest(request));
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
    return this.useCases.cancelActivity(id, parsed.reason, mutationCtx(request, idempotencyKey));
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
    return this.useCases.rsvp(id, parsed, mutationCtx(request, idempotencyKey));
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
      },
      mutationCtx(request, idempotencyKey),
    );
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
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const limit =
      limitRaw === undefined || limitRaw.trim() === '' ? undefined : Number.parseInt(limitRaw, 10);
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      throw new ActivityError('VALIDATION_FAILED', 'limit must be a positive integer');
    }
    if (guildId !== undefined && guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId must be non-empty when provided');
    }
    return this.useCases.listInbox(actorFromRequest(request), {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      ...(guildId !== undefined ? { guildId } : {}),
    });
  }

  @Post('inbox/:id/read')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async markInboxRead(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.useCases.markInboxRead(id, actorFromRequest(request));
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
