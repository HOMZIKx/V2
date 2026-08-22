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
import { LFG_DUNGEON_ACTIVITY_TYPES } from '@v2/hub-core';
import { z } from 'zod';

import type { ActorSubject } from '../application/ports/activity.ports.js';
import { ActivityAdminUseCases } from '../application/use-cases/activity-admin.use-cases.js';
import { ActivityUseCases } from '../application/use-cases/activity.use-cases.js';
import { PARTICIPANT_FIELD_TYPES } from '../domain/admin-config-validation.js';
import { ActivityError } from '../domain/errors.js';
import { STATUS_BEHAVIORS } from '../domain/status-def.js';
import { ActivityExceptionFilter } from './activity-exception.filter.js';
import { ACTIVITY_ADMIN_USE_CASES, ACTIVITY_USE_CASES } from './activity.tokens.js';
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

/** Drop keys whose value is `undefined` for exactOptionalPropertyTypes-safe spreads. */
function definedProps<T extends object>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
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

function parseExpectedRevision(
  bodyRevision: number | undefined,
  ifMatch: string | undefined,
): number {
  if (bodyRevision !== undefined) {
    return bodyRevision;
  }
  if (ifMatch !== undefined && ifMatch.trim().length > 0) {
    const parsed = Number(ifMatch.replace(/"/g, '').trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new ActivityError('VALIDATION_FAILED', 'If-Match must be an integer revision');
    }
    return parsed;
  }
  throw new ActivityError(
    'VALIDATION_FAILED',
    'expectedRevision (body) or If-Match header is required',
  );
}

function optionalDate(value: string | undefined): Date | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ActivityError('VALIDATION_FAILED', 'Invalid datetime');
  }
  return date;
}

const configPutSchema = z.object({
  expectedRevision: z.number().int().positive().optional(),
  organizerDefaultStatusId: z.string().uuid().nullable().optional(),
  waitlistPromotionStatusId: z.string().uuid().nullable().optional(),
  maxActivePerCreator: z.number().int().positive().optional(),
  registrationDefaultClosesAtStart: z.boolean().optional(),
  allowOtherActivity: z.boolean().optional(),
  maxCreateHorizonDays: z.number().int().optional(),
  postRetentionHoursAfterFinish: z.number().int().optional(),
  reminders: z.array(z.record(z.string(), z.unknown())).optional(),
  dmNotificationsEnabled: z.boolean().optional(),
  allowedPublishChannelIds: z.array(z.string().min(1)).optional(),
  pingRoleIds: z.array(z.string().min(1)).optional(),
  hubChannelId: z.string().min(1).nullable().optional(),
});

const typeCreateSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  isOther: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  statusDefIds: z.array(z.string().uuid()).optional(),
  participantFields: z
    .array(
      z.object({
        fieldDefId: z.string().uuid(),
        required: z.boolean(),
      }),
    )
    .optional(),
});

const typeUpdateSchema = typeCreateSchema.omit({ key: true }).partial();

const statusCreateSchema = z.object({
  label: z.string().min(1).max(200),
  occupiesSlot: z.boolean(),
  behavior: z.enum(STATUS_BEHAVIORS),
  selectableByMember: z.boolean(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  seedKey: z.string().min(1).max(100).nullable().optional(),
});

const statusUpdateSchema = statusCreateSchema.partial();

const fieldCreateSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  fieldType: z.enum(PARTICIPANT_FIELD_TYPES),
  requiredDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  optionsJson: z.array(z.unknown()).optional(),
  maxLength: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const fieldUpdateSchema = fieldCreateSchema.omit({ key: true }).partial();

const reasonCreateSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  allowDetails: z.boolean().optional(),
  requiresDetails: z.boolean().optional(),
});

const reasonUpdateSchema = reasonCreateSchema.omit({ key: true }).partial();

const channelsPutSchema = z.object({
  channelIds: z.array(z.string().min(1)),
  expectedRevision: z.number().int().positive().optional(),
});

const pingRolesPutSchema = z.object({
  roleIds: z.array(z.string().min(1)),
  expectedRevision: z.number().int().positive().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(1000),
});

const reportPatchSchema = z.object({
  status: z.enum(['open', 'resolved']),
});

const hubPublishIntentSchema = z.object({
  channelId: z.string().min(1),
  expectedRevision: z.number().int().positive().optional(),
});

const lfgCompositionRoleSchema = z.object({
  partyRoleKey: z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']),
  requiredCount: z.number().int().nonnegative(),
  preferred: z.boolean().optional(),
});

const lfgDungeonTypeKeys = LFG_DUNGEON_ACTIVITY_TYPES.map((entry) => entry.key) as [
  string,
  ...string[],
];

const lfgCompositionPutSchema = z.object({
  activityTypeKey: z.enum(lfgDungeonTypeKeys),
  roles: z.array(lfgCompositionRoleSchema).min(1).max(4),
});

@Controller('activity/v1/admin')
@UseGuards(InboundAssertionGuard)
@UseFilters(ActivityExceptionFilter)
export class ActivityAdminController {
  public constructor(
    @Inject(ACTIVITY_ADMIN_USE_CASES) private readonly admin: ActivityAdminUseCases,
    @Inject(ACTIVITY_USE_CASES) private readonly activities: ActivityUseCases,
  ) {}

  @Get('guilds')
  @RequireOperation('activity_read')
  public async listGuilds(@Req() request: AuthenticatedRequest) {
    return { guilds: await this.admin.listAdminGuilds(actorFromRequest(request)) };
  }

  @Get('diagnostics/dependencies')
  @RequireOperation('activity_read')
  public async dependencyDiagnostics(@Req() request: AuthenticatedRequest) {
    return this.admin.diagnoseAdminDependencies(actorFromRequest(request));
  }

  @Get('guilds/:guildId/config')
  @RequireOperation('activity_read')
  public async getConfig(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    return this.admin.getAdminConfig(guildId, actorFromRequest(request));
  }

  @Put('guilds/:guildId/config')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async putConfig(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const parsed = parseOrThrow(configPutSchema, body);
    const expectedRevision = parseExpectedRevision(parsed.expectedRevision, ifMatch);
    const patch = { ...parsed };
    delete patch.expectedRevision;
    return this.admin.putAdminConfig(
      guildId,
      { ...definedProps(patch), expectedRevision },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/readiness')
  @RequireOperation('activity_read')
  public async readiness(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    return this.admin.getReadiness(guildId, actorFromRequest(request));
  }

  @Get('guilds/:guildId/types')
  @RequireOperation('activity_read')
  public async listTypes(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    return this.admin.listTypes(guildId, actorFromRequest(request));
  }

  @Post('guilds/:guildId/types')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createType(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(typeCreateSchema, body);
    return this.admin.createType(
      guildId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Patch('guilds/:guildId/types/:typeId')
  @RequireOperation('activity_mutate')
  public async updateType(
    @Param('guildId') guildId: string,
    @Param('typeId') typeId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(typeUpdateSchema, body);
    return this.admin.updateType(
      guildId,
      typeId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Delete('guilds/:guildId/types/:typeId')
  @RequireOperation('activity_mutate')
  public async deactivateType(
    @Param('guildId') guildId: string,
    @Param('typeId') typeId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.deactivateType(guildId, typeId, mutationCtx(request, idempotencyKey));
  }

  @Get('guilds/:guildId/statuses')
  @RequireOperation('activity_read')
  public async listStatuses(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.listStatuses(guildId, actorFromRequest(request));
  }

  @Post('guilds/:guildId/statuses')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createStatus(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(statusCreateSchema, body);
    return this.admin.createStatus(
      guildId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Patch('guilds/:guildId/statuses/:statusId')
  @RequireOperation('activity_mutate')
  public async updateStatus(
    @Param('guildId') guildId: string,
    @Param('statusId') statusId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(statusUpdateSchema, body);
    return this.admin.updateStatus(
      guildId,
      statusId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Delete('guilds/:guildId/statuses/:statusId')
  @RequireOperation('activity_mutate')
  public async deactivateStatus(
    @Param('guildId') guildId: string,
    @Param('statusId') statusId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.deactivateStatus(guildId, statusId, mutationCtx(request, idempotencyKey));
  }

  @Get('guilds/:guildId/participant-fields')
  @RequireOperation('activity_read')
  public async listFields(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    return this.admin.listParticipantFields(guildId, actorFromRequest(request));
  }

  @Post('guilds/:guildId/participant-fields')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createField(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(fieldCreateSchema, body);
    return this.admin.createParticipantField(
      guildId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Patch('guilds/:guildId/participant-fields/:fieldId')
  @RequireOperation('activity_mutate')
  public async updateField(
    @Param('guildId') guildId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(fieldUpdateSchema, body);
    return this.admin.updateParticipantField(
      guildId,
      fieldId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Delete('guilds/:guildId/participant-fields/:fieldId')
  @RequireOperation('activity_mutate')
  public async deactivateField(
    @Param('guildId') guildId: string,
    @Param('fieldId') fieldId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.deactivateParticipantField(
      guildId,
      fieldId,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/report-reasons')
  @RequireOperation('activity_read')
  public async listReasons(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.listReportReasons(guildId, actorFromRequest(request));
  }

  @Post('guilds/:guildId/report-reasons')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async createReason(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(reasonCreateSchema, body);
    return this.admin.createReportReason(
      guildId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Patch('guilds/:guildId/report-reasons/:reasonId')
  @RequireOperation('activity_mutate')
  public async updateReason(
    @Param('guildId') guildId: string,
    @Param('reasonId') reasonId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(reasonUpdateSchema, body);
    return this.admin.updateReportReason(
      guildId,
      reasonId,
      definedProps(parsed),
      mutationCtx(request, idempotencyKey),
    );
  }

  @Delete('guilds/:guildId/report-reasons/:reasonId')
  @RequireOperation('activity_mutate')
  public async deactivateReason(
    @Param('guildId') guildId: string,
    @Param('reasonId') reasonId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.deactivateReportReason(
      guildId,
      reasonId,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/channels')
  @RequireOperation('activity_read')
  public async getChannels(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.getChannels(guildId, actorFromRequest(request));
  }

  @Put('guilds/:guildId/channels')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async putChannels(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const parsed = parseOrThrow(channelsPutSchema, body);
    const expectedRevision =
      parsed.expectedRevision ??
      (ifMatch !== undefined ? parseExpectedRevision(undefined, ifMatch) : undefined);
    return this.admin.putChannels(
      guildId,
      parsed.channelIds,
      expectedRevision,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/ping-roles')
  @RequireOperation('activity_read')
  public async getPingRoles(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.getPingRoles(guildId, actorFromRequest(request));
  }

  @Put('guilds/:guildId/ping-roles')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async putPingRoles(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const parsed = parseOrThrow(pingRolesPutSchema, body);
    const expectedRevision =
      parsed.expectedRevision ??
      (ifMatch !== undefined ? parseExpectedRevision(undefined, ifMatch) : undefined);
    return this.admin.putPingRoles(
      guildId,
      parsed.roleIds,
      expectedRevision,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/events')
  @RequireOperation('activity_read')
  public async listEvents(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('organizerDiscordUserId') organizerDiscordUserId?: string,
    @Query('from') fromQuery?: string,
    @Query('to') toQuery?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const from = optionalDate(fromQuery);
    const to = optionalDate(toQuery);
    return this.admin.listEvents(guildId, actorFromRequest(request), {
      ...(status !== undefined ? { status } : {}),
      ...(organizerDiscordUserId !== undefined ? { organizerDiscordUserId } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(limit !== undefined ? { limit: Number(limit) } : {}),
      ...(offset !== undefined ? { offset: Number(offset) } : {}),
    });
  }

  @Get('guilds/:guildId/events/:activityId')
  @RequireOperation('activity_read')
  public async getEvent(
    @Param('guildId') guildId: string,
    @Param('activityId') activityId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.getEvent(guildId, activityId, actorFromRequest(request));
  }

  @Post('guilds/:guildId/events/:activityId/cancel')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async cancelEvent(
    @Param('guildId') guildId: string,
    @Param('activityId') activityId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    await this.admin.assertActivityInGuild(guildId, activityId);
    const parsed = parseOrThrow(cancelSchema, body);
    return this.activities.cancelActivity(
      activityId,
      parsed.reason,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('guilds/:guildId/events/:activityId/takeover')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async takeoverEvent(
    @Param('guildId') guildId: string,
    @Param('activityId') activityId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    await this.admin.assertActivityInGuild(guildId, activityId);
    return this.activities.takeover(activityId, mutationCtx(request, idempotencyKey));
  }

  @Get('guilds/:guildId/projections')
  @RequireOperation('activity_read')
  public async listProjections(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.listProjectionProblems(guildId, actorFromRequest(request));
  }

  @Post('guilds/:guildId/projections')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async scanProjections(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.requestProjectionScan(guildId, mutationCtx(request, idempotencyKey));
  }

  @Post('guilds/:guildId/projections/:activityId/repair')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async repairProjection(
    @Param('guildId') guildId: string,
    @Param('activityId') activityId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.repairProjection(guildId, activityId, mutationCtx(request, idempotencyKey));
  }

  @Get('guilds/:guildId/reports')
  @RequireOperation('activity_read')
  public async listReports(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    const parsedStatus =
      status === undefined
        ? undefined
        : status === 'open' || status === 'resolved'
          ? status
          : (() => {
              throw new ActivityError('VALIDATION_FAILED', 'status must be open|resolved');
            })();
    return this.admin.listAdminReports(guildId, actorFromRequest(request), parsedStatus);
  }

  @Patch('guilds/:guildId/reports/:reportId')
  @RequireOperation('activity_mutate')
  public async patchReport(
    @Param('guildId') guildId: string,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(reportPatchSchema, body);
    return this.admin.updateAdminReport(
      guildId,
      reportId,
      parsed.status,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/audit')
  @RequireOperation('activity_read')
  public async listAudit(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
    @Query('actionPrefix') actionPrefix?: string,
    @Query('activityId') activityId?: string,
    @Query('actorDiscordUserId') actorDiscordUserId?: string,
    @Query('from') fromQuery?: string,
    @Query('to') toQuery?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const from = optionalDate(fromQuery);
    const to = optionalDate(toQuery);
    return this.admin.listAudit(guildId, actorFromRequest(request), {
      ...(actionPrefix !== undefined ? { actionPrefix } : {}),
      ...(activityId !== undefined ? { activityId } : {}),
      ...(actorDiscordUserId !== undefined ? { actorDiscordUserId } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(limit !== undefined ? { limit: Number(limit) } : {}),
      ...(offset !== undefined ? { offset: Number(offset) } : {}),
    });
  }

  @Get('guilds/:guildId/hub')
  @RequireOperation('activity_read')
  public async getHub(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    return this.admin.getHubStatus(guildId, actorFromRequest(request));
  }

  @Get('guilds/:guildId/hub/modules')
  @RequireOperation('activity_read')
  public async listHubModules(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.listHubModules(guildId, actorFromRequest(request));
  }

  @Put('guilds/:guildId/hub/modules')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async updateHubModules(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(z.object({ overrides: z.record(z.string(), z.boolean()) }), body);
    return this.admin.updateHubModuleOverrides(
      guildId,
      parsed.overrides,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/hub/legacy-channels')
  @RequireOperation('activity_read')
  public async listHubLegacyChannels(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.listHubLegacyChannels(guildId, actorFromRequest(request));
  }

  @Put('guilds/:guildId/hub/legacy-channels')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async upsertHubLegacyChannel(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsed = parseOrThrow(
      z.object({
        channelId: z.string().min(1),
        label: z.string().min(1).max(200),
        relatedModuleKey: z.string().min(1).max(64).nullable().optional(),
        status: z.enum(['LEGACY_ACTIVE', 'V2_READY', 'OWNER_CAN_RETIRE']),
        notes: z.string().max(2000).nullable().optional(),
      }),
      body,
    );
    return this.admin.upsertHubLegacyChannel(
      guildId,
      {
        channelId: parsed.channelId,
        label: parsed.label,
        relatedModuleKey: parsed.relatedModuleKey ?? null,
        status: parsed.status,
        notes: parsed.notes ?? null,
      },
      mutationCtx(request, idempotencyKey),
    );
  }

  @Post('guilds/:guildId/hub/publish-intent')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async hubPublishIntent(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const parsed = parseOrThrow(hubPublishIntentSchema, body);
    const expectedRevision =
      parsed.expectedRevision ??
      (ifMatch !== undefined ? parseExpectedRevision(undefined, ifMatch) : undefined);
    return this.admin.publishHubIntent(
      guildId,
      parsed.channelId,
      expectedRevision,
      mutationCtx(request, idempotencyKey),
    );
  }

  @Get('guilds/:guildId/discord/channels')
  @RequireOperation('activity_read')
  public async listDiscordChannels(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { channels: await this.admin.listDiscordChannels(guildId, actorFromRequest(request)) };
  }

  @Get('guilds/:guildId/discord/roles')
  @RequireOperation('activity_read')
  public async listDiscordRoles(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { roles: await this.admin.listDiscordRoles(guildId, actorFromRequest(request)) };
  }

  @Post('guilds/:guildId/hub/publish')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async hubPublish(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.executeHubPublish(guildId, false, mutationCtx(request, idempotencyKey));
  }

  @Post('guilds/:guildId/hub/reconcile')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async hubReconcile(
    @Param('guildId') guildId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.admin.executeHubPublish(guildId, true, mutationCtx(request, idempotencyKey));
  }

  @Post('guilds/:guildId/discord/members/resolve')
  @HttpCode(200)
  @RequireOperation('activity_read')
  public async resolveDiscordMembers(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = parseOrThrow(z.object({ userIds: z.array(z.string().min(1)).max(50) }), body);
    return {
      members: await this.admin.resolveMemberDisplays(
        guildId,
        parsed.userIds,
        actorFromRequest(request),
      ),
    };
  }

  @Get('organizations/:orgId/lfg/composition-templates')
  @RequireOperation('activity_read')
  public async listLfgCompositionTemplates(
    @Param('orgId') orgId: string,
    @Query('activityTypeKey') activityTypeKey: string | undefined,
    @Query('guildId') guildId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (activityTypeKey === undefined || activityTypeKey.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'activityTypeKey is required');
    }
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    return this.admin.listLfgCompositionTemplates(
      orgId.trim(),
      activityTypeKey.trim(),
      guildId.trim(),
      actorFromRequest(request),
    );
  }

  @Put('organizations/:orgId/lfg/composition-templates')
  @HttpCode(200)
  @RequireOperation('activity_mutate')
  public async putLfgCompositionTemplates(
    @Param('orgId') orgId: string,
    @Query('guildId') guildId: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (guildId === undefined || guildId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
    }
    const parsed = parseOrThrow(lfgCompositionPutSchema, body);
    return this.admin.upsertLfgCompositionTemplates(
      orgId.trim(),
      guildId.trim(),
      {
        activityTypeKey: parsed.activityTypeKey,
        roles: parsed.roles.map((role) => ({
          partyRoleKey: role.partyRoleKey,
          requiredCount: role.requiredCount,
          ...(role.preferred !== undefined ? { preferred: role.preferred } : {}),
        })),
      },
      mutationCtx(request, idempotencyKey),
    );
  }
}
