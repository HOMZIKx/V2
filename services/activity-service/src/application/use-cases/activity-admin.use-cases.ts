import { randomUUID } from 'node:crypto';

import {
  assertCreateHorizonDays,
  assertParticipantFieldType,
  assertPingRoleIds,
  assertPostRetentionHours,
  assertRemindersJson,
  evaluateAdminReadiness,
  validateOrganizerDefault,
  validateWaitlistPromotion,
  type AdminReadinessIssue,
} from '../../domain/admin-config-validation.js';
import { ActivityError } from '../../domain/errors.js';
import { OUTBOX_EVENT_TYPES } from '../../domain/outbox-events.js';
import { ACTIVITY_PERMISSIONS } from '../../domain/permissions.js';
import type { StatusBehavior } from '../../domain/status-def.js';
import type {
  ActivityRecord,
  ActivityTx,
  ActivityUseCaseDeps,
  ActorSubject,
  PutGuildAdminConfigInput,
} from '../ports/activity.ports.js';
import type { ChannelValidationResult } from '../ports/discord-channel-validation.port.js';
import type { MutationContext } from './activity.use-cases.js';

function actorKey(actor: ActorSubject): string {
  return actor.discordUserId ?? actor.v2UserId ?? 'anonymous';
}

function channelIssueFromResult(result: ChannelValidationResult): AdminReadinessIssue | null {
  if (result.ok || result.code === 'CHANNEL_OK' || result.code === undefined) {
    return null;
  }
  const code = result.code as AdminReadinessIssue['code'];
  return {
    code,
    message: result.detail ?? `Channel ${result.channelId} failed validation (${result.code})`,
  };
}

function assertChannelsValid(results: readonly ChannelValidationResult[]): void {
  const failed = results.filter((row) => !row.ok);
  if (failed.length === 0) {
    return;
  }
  const detail = failed
    .map(
      (row) => `${row.channelId}:${row.code ?? 'UNKNOWN'}${row.detail ? ` (${row.detail})` : ''}`,
    )
    .join('; ');
  throw new ActivityError('VALIDATION_FAILED', `Channel validation failed: ${detail}`);
}

export class ActivityAdminUseCases {
  public constructor(private readonly deps: ActivityUseCaseDeps) {}

  private async requirePermission(
    actor: ActorSubject,
    permissionId: string,
    guildId: string,
    operationClass: 'ordinary' | 'sensitive' = 'sensitive',
  ): Promise<void> {
    const result = await this.deps.authorize.authorize({
      subject: actor,
      permissionId,
      scope: { type: 'guild', guildId },
      operationClass,
    });
    if (!result.allowed) {
      throw new ActivityError('FORBIDDEN', `Missing permission ${permissionId}`);
    }
  }

  private async requireConfigManage(actor: ActorSubject, guildId: string): Promise<void> {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.CONFIG_MANAGE, guildId, 'sensitive');
  }

  private async requireManageGuild(actor: ActorSubject, guildId: string): Promise<void> {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.MANAGE_GUILD, guildId, 'sensitive');
  }

  private async requirePanelManage(actor: ActorSubject, guildId: string): Promise<void> {
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.PANEL_MANAGE, guildId, 'sensitive');
  }

  private async requireReportManage(actor: ActorSubject, guildId: string): Promise<void> {
    const manageGuild = await this.deps.authorize.authorize({
      subject: actor,
      permissionId: ACTIVITY_PERMISSIONS.MANAGE_GUILD,
      scope: { type: 'guild', guildId },
      operationClass: 'sensitive',
    });
    if (manageGuild.allowed) {
      return;
    }
    await this.requirePermission(actor, ACTIVITY_PERMISSIONS.REPORT_MANAGE, guildId, 'sensitive');
  }

  private async requireDiscordChannelValidation(
    guildId: string,
    channelIds: readonly string[],
  ): Promise<readonly ChannelValidationResult[]> {
    const port = this.deps.discordChannelValidation;
    if (port === undefined || port === null) {
      throw new ActivityError(
        'CONFIG_INVALID',
        'Discord channel validation is unavailable (DISCORD_DEPENDENCY_UNAVAILABLE)',
      );
    }
    return port.validateChannels(guildId, channelIds);
  }

  private async audit(
    tx: ActivityTx,
    ctx: MutationContext,
    guildId: string,
    action: string,
    details: Record<string, unknown> = {},
    activityId?: string,
  ): Promise<void> {
    await tx.insertAudit({
      guildId,
      ...(activityId !== undefined ? { activityId } : {}),
      ...(ctx.actor.discordUserId !== undefined
        ? { actorDiscordUserId: ctx.actor.discordUserId }
        : {}),
      ...(ctx.actor.v2UserId !== undefined ? { actorV2UserId: ctx.actor.v2UserId } : {}),
      action,
      details,
      ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
    });
  }

  private async mutate<T>(
    ctx: MutationContext,
    operation: string,
    scope: string,
    run: (tx: ActivityTx) => Promise<T>,
  ): Promise<T> {
    return this.deps.repository.withTransaction(async (tx) => {
      if (ctx.idempotencyKey !== undefined) {
        const existing = await tx.findIdempotency({
          scope,
          actorKey: actorKey(ctx.actor),
          operation,
          idempotencyKey: ctx.idempotencyKey,
        });
        if (existing !== null) {
          return existing.responseBody as T;
        }
      }
      const result = await run(tx);
      if (ctx.idempotencyKey !== undefined) {
        await tx.saveIdempotency({
          scope,
          actorKey: actorKey(ctx.actor),
          operation,
          idempotencyKey: ctx.idempotencyKey,
          responseStatus: 200,
          responseBody: result,
        });
      }
      return result;
    });
  }

  private async validateStatusRefsInTx(
    tx: ActivityTx,
    organizerDefaultStatusId: string | null,
    waitlistPromotionStatusId: string | null,
  ): Promise<void> {
    if (organizerDefaultStatusId !== null) {
      const def = await tx.getStatusDef(organizerDefaultStatusId);
      validateOrganizerDefault(def ?? undefined);
    }
    if (waitlistPromotionStatusId !== null) {
      const def = await tx.getStatusDef(waitlistPromotionStatusId);
      validateWaitlistPromotion(def ?? undefined);
    }
  }

  public async getAdminConfig(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const settings = await tx.getSettings(guildId);
      if (settings === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      return settings;
    });
  }

  public async putAdminConfig(
    guildId: string,
    input: PutGuildAdminConfigInput,
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    if (input.maxCreateHorizonDays !== undefined) {
      assertCreateHorizonDays(input.maxCreateHorizonDays);
    }
    if (input.postRetentionHoursAfterFinish !== undefined) {
      assertPostRetentionHours(input.postRetentionHoursAfterFinish);
    }
    if (input.pingRoleIds !== undefined) {
      assertPingRoleIds(input.pingRoleIds);
    }
    if (input.reminders !== undefined) {
      assertRemindersJson(input.reminders);
    }
    if (input.maxActivePerCreator !== undefined && input.maxActivePerCreator < 1) {
      throw new ActivityError('VALIDATION_FAILED', 'maxActivePerCreator must be >= 1');
    }
    if (input.allowedPublishChannelIds !== undefined) {
      const results = await this.requireDiscordChannelValidation(
        guildId,
        input.allowedPublishChannelIds,
      );
      assertChannelsValid(results);
    }

    return this.mutate(ctx, 'admin-config-put', `guild:${guildId}`, async (tx) => {
      const current = await tx.getSettings(guildId);
      if (current === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }

      const nextOrganizer =
        input.organizerDefaultStatusId !== undefined
          ? input.organizerDefaultStatusId
          : current.organizerDefaultStatusId;
      const nextWaitlist =
        input.waitlistPromotionStatusId !== undefined
          ? input.waitlistPromotionStatusId
          : current.waitlistPromotionStatusId;

      await this.validateStatusRefsInTx(tx, nextOrganizer, nextWaitlist);

      const updated = await tx.putGuildAdminConfig(guildId, input);
      await this.audit(tx, ctx, guildId, 'admin.config.put', {
        expectedRevision: input.expectedRevision,
        nextRevision: updated.configRevision,
      });
      return updated;
    });
  }

  public async getReadiness(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const settings = await tx.getSettings(guildId);
      if (settings === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      const statuses = await tx.listStatusDefs(guildId);
      const types = await tx.listActivityTypes(guildId);
      const byId = new Map(statuses.map((s) => [s.id, s]));
      const result = evaluateAdminReadiness({
        organizerDefaultStatusId: settings.organizerDefaultStatusId,
        waitlistPromotionStatusId: settings.waitlistPromotionStatusId,
        organizerDefaultStatus:
          settings.organizerDefaultStatusId === null
            ? undefined
            : byId.get(settings.organizerDefaultStatusId),
        waitlistPromotionStatus:
          settings.waitlistPromotionStatusId === null
            ? undefined
            : byId.get(settings.waitlistPromotionStatusId),
        enabledActivityTypeCount: types.filter((t) => t.enabled).length,
        activeStatusDefCount: statuses.filter((s) => s.active).length,
        hubChannelId: settings.hubChannelId,
        allowedPublishChannelCount: settings.allowedPublishChannelIds.length,
      });

      const issues: AdminReadinessIssue[] = [...result.issues];
      const channelIds = [
        ...settings.allowedPublishChannelIds,
        ...(settings.hubChannelId !== null && settings.hubChannelId.trim().length > 0
          ? [settings.hubChannelId]
          : []),
      ];

      const port = this.deps.discordChannelValidation;
      if (channelIds.length > 0) {
        if (port === undefined || port === null) {
          issues.push({
            code: 'DISCORD_DEPENDENCY_UNAVAILABLE',
            message: 'Discord channel validation dependency is unavailable',
          });
          return {
            guildId,
            ready: false,
            status: 'CONFIGURATION_REQUIRED' as const,
            issues,
          };
        }
        try {
          const validation = await port.validateChannels(guildId, channelIds);
          for (const row of validation) {
            const issue = channelIssueFromResult(row);
            if (issue !== null) {
              issues.push(issue);
            }
          }
        } catch {
          issues.push({
            code: 'DISCORD_DEPENDENCY_UNAVAILABLE',
            message: 'Discord channel validation dependency is unavailable',
          });
          return {
            guildId,
            ready: false,
            status: 'CONFIGURATION_REQUIRED' as const,
            issues,
          };
        }
      }

      const ready = issues.length === 0;
      return {
        guildId,
        ready,
        status: ready ? ('READY' as const) : ('NOT_READY' as const),
        issues,
      };
    });
  }

  public async listTypes(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listActivityTypes(guildId));
  }

  public async createType(
    guildId: string,
    input: {
      key: string;
      label: string;
      enabled?: boolean | undefined;
      isOther?: boolean | undefined;
      sortOrder?: number | undefined;
      statusDefIds?: readonly string[] | undefined;
      participantFields?: readonly { fieldDefId: string; required: boolean }[] | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-type-create', `guild:${guildId}`, async (tx) => {
      const created = await tx.insertActivityType({
        id: randomUUID(),
        guildId,
        key: input.key.trim(),
        label: input.label.trim(),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.isOther !== undefined ? { isOther: input.isOther } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.statusDefIds !== undefined ? { statusDefIds: input.statusDefIds } : {}),
        ...(input.participantFields !== undefined
          ? { participantFields: input.participantFields }
          : {}),
      });
      await this.audit(tx, ctx, guildId, 'admin.type.create', { typeId: created.id });
      return created;
    });
  }

  public async updateType(
    guildId: string,
    typeId: string,
    patch: {
      label?: string | undefined;
      enabled?: boolean | undefined;
      isOther?: boolean | undefined;
      sortOrder?: number | undefined;
      statusDefIds?: readonly string[] | undefined;
      participantFields?: readonly { fieldDefId: string; required: boolean }[] | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-type-update', `guild:${guildId}`, async (tx) => {
      const existing = await tx.getActivityType(typeId);
      if (existing === null || existing.guildId !== guildId) {
        throw new ActivityError('NOT_FOUND', 'Activity type not found');
      }
      const updated = await tx.updateActivityType(typeId, patch);
      await this.audit(tx, ctx, guildId, 'admin.type.update', { typeId });
      return updated;
    });
  }

  public async deactivateType(guildId: string, typeId: string, ctx: MutationContext) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-type-deactivate', `guild:${guildId}`, async (tx) => {
      const existing = await tx.getActivityType(typeId);
      if (existing === null || existing.guildId !== guildId) {
        throw new ActivityError('NOT_FOUND', 'Activity type not found');
      }
      const usage = await tx.countActivitiesUsingType(typeId);
      const updated = await tx.deactivateActivityType(typeId);
      await this.audit(tx, ctx, guildId, 'admin.type.deactivate', {
        typeId,
        historicalUsage: usage,
      });
      return updated;
    });
  }

  public async listStatuses(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listStatusDefs(guildId));
  }

  public async createStatus(
    guildId: string,
    input: {
      label: string;
      occupiesSlot: boolean;
      behavior: StatusBehavior;
      selectableByMember: boolean;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
      seedKey?: string | null | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-status-create', `guild:${guildId}`, async (tx) => {
      const created = await tx.insertStatusDef({
        id: randomUUID(),
        guildId,
        label: input.label.trim(),
        occupiesSlot: input.occupiesSlot,
        behavior: input.behavior,
        selectableByMember: input.selectableByMember,
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.seedKey !== undefined ? { seedKey: input.seedKey } : {}),
      });
      await this.audit(tx, ctx, guildId, 'admin.status.create', { statusDefId: created.id });
      return created;
    });
  }

  public async updateStatus(
    guildId: string,
    statusId: string,
    patch: {
      label?: string | undefined;
      occupiesSlot?: boolean | undefined;
      behavior?: StatusBehavior | undefined;
      selectableByMember?: boolean | undefined;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-status-update', `guild:${guildId}`, async (tx) => {
      const existing = await tx.getStatusDef(statusId);
      if (existing === null || existing.guildId !== guildId) {
        throw new ActivityError('NOT_FOUND', 'Status definition not found');
      }
      const settings = await tx.getSettings(guildId);
      if (
        patch.active === false &&
        settings !== null &&
        (settings.organizerDefaultStatusId === statusId ||
          settings.waitlistPromotionStatusId === statusId)
      ) {
        throw new ActivityError(
          'CONFLICT',
          'Cannot deactivate a status referenced by organizerDefault or waitlistPromotion',
        );
      }
      const updated = await tx.updateStatusDef(statusId, patch);
      if (
        settings !== null &&
        (settings.organizerDefaultStatusId === statusId ||
          settings.waitlistPromotionStatusId === statusId)
      ) {
        await this.validateStatusRefsInTx(
          tx,
          settings.organizerDefaultStatusId,
          settings.waitlistPromotionStatusId,
        );
      }
      await this.audit(tx, ctx, guildId, 'admin.status.update', { statusDefId: statusId });
      return updated;
    });
  }

  public async deactivateStatus(guildId: string, statusId: string, ctx: MutationContext) {
    return this.updateStatus(guildId, statusId, { active: false }, ctx);
  }

  public async listParticipantFields(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listParticipantFieldDefs(guildId));
  }

  public async createParticipantField(
    guildId: string,
    input: {
      key: string;
      label: string;
      fieldType: string;
      requiredDefault?: boolean | undefined;
      active?: boolean | undefined;
      optionsJson?: readonly unknown[] | undefined;
      maxLength?: number | null | undefined;
      sortOrder?: number | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    assertParticipantFieldType(input.fieldType);
    return this.mutate(ctx, 'admin-field-create', `guild:${guildId}`, async (tx) => {
      const created = await tx.insertParticipantFieldDef({
        id: randomUUID(),
        guildId,
        key: input.key.trim(),
        label: input.label.trim(),
        fieldType: input.fieldType,
        ...(input.requiredDefault !== undefined ? { requiredDefault: input.requiredDefault } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.optionsJson !== undefined ? { optionsJson: input.optionsJson } : {}),
        ...(input.maxLength !== undefined ? { maxLength: input.maxLength } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      });
      await this.audit(tx, ctx, guildId, 'admin.field.create', { fieldDefId: created.id });
      return created;
    });
  }

  public async updateParticipantField(
    guildId: string,
    fieldId: string,
    patch: {
      label?: string | undefined;
      fieldType?: string | undefined;
      requiredDefault?: boolean | undefined;
      active?: boolean | undefined;
      optionsJson?: readonly unknown[] | undefined;
      maxLength?: number | null | undefined;
      sortOrder?: number | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    if (patch.fieldType !== undefined) {
      assertParticipantFieldType(patch.fieldType);
    }
    return this.mutate(ctx, 'admin-field-update', `guild:${guildId}`, async (tx) => {
      const existing = await tx.getParticipantFieldDef(fieldId);
      if (existing === null || existing.guildId !== guildId) {
        throw new ActivityError('NOT_FOUND', 'Participant field not found');
      }
      const updated = await tx.updateParticipantFieldDef(fieldId, patch);
      await this.audit(tx, ctx, guildId, 'admin.field.update', { fieldDefId: fieldId });
      return updated;
    });
  }

  public async deactivateParticipantField(guildId: string, fieldId: string, ctx: MutationContext) {
    return this.updateParticipantField(guildId, fieldId, { active: false }, ctx);
  }

  public async listReportReasons(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listReportReasonDefs(guildId));
  }

  public async createReportReason(
    guildId: string,
    input: {
      key: string;
      label: string;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
      allowDetails?: boolean | undefined;
      requiresDetails?: boolean | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-reason-create', `guild:${guildId}`, async (tx) => {
      const created = await tx.insertReportReasonDef({
        id: randomUUID(),
        guildId,
        key: input.key.trim(),
        label: input.label.trim(),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.allowDetails !== undefined ? { allowDetails: input.allowDetails } : {}),
        ...(input.requiresDetails !== undefined ? { requiresDetails: input.requiresDetails } : {}),
      });
      await this.audit(tx, ctx, guildId, 'admin.reason.create', { reasonId: created.id });
      return created;
    });
  }

  public async updateReportReason(
    guildId: string,
    reasonId: string,
    patch: {
      label?: string | undefined;
      active?: boolean | undefined;
      sortOrder?: number | undefined;
      allowDetails?: boolean | undefined;
      requiresDetails?: boolean | undefined;
    },
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-reason-update', `guild:${guildId}`, async (tx) => {
      const existing = await tx.getReportReasonDef(reasonId);
      if (existing === null || existing.guildId !== guildId) {
        throw new ActivityError('NOT_FOUND', 'Report reason not found');
      }
      const updated = await tx.updateReportReasonDef(reasonId, patch);
      await this.audit(tx, ctx, guildId, 'admin.reason.update', { reasonId });
      return updated;
    });
  }

  public async deactivateReportReason(guildId: string, reasonId: string, ctx: MutationContext) {
    return this.updateReportReason(guildId, reasonId, { active: false }, ctx);
  }

  public async getChannels(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const settings = await tx.getSettings(guildId);
      if (settings === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      return {
        allowedPublishChannelIds: settings.allowedPublishChannelIds,
        configRevision: settings.configRevision,
      };
    });
  }

  public async putChannels(
    guildId: string,
    channelIds: readonly string[],
    expectedRevision: number | undefined,
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    const results = await this.requireDiscordChannelValidation(guildId, channelIds);
    assertChannelsValid(results);
    return this.mutate(ctx, 'admin-channels-put', `guild:${guildId}`, async (tx) => {
      const current = await tx.getSettings(guildId);
      if (current === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      if (expectedRevision !== undefined && current.configRevision !== expectedRevision) {
        throw new ActivityError('CONFLICT', 'Config revision mismatch');
      }
      const updated = await tx.putGuildAdminConfig(guildId, {
        expectedRevision: expectedRevision ?? current.configRevision,
        allowedPublishChannelIds: channelIds,
      });
      await this.audit(tx, ctx, guildId, 'admin.channels.put', {
        channelCount: channelIds.length,
      });
      return updated;
    });
  }

  public async getPingRoles(guildId: string, actor: ActorSubject) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const settings = await tx.getSettings(guildId);
      if (settings === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      return {
        pingRoleIds: settings.pingRoleIds,
        configRevision: settings.configRevision,
      };
    });
  }

  public async putPingRoles(
    guildId: string,
    roleIds: readonly string[],
    expectedRevision: number | undefined,
    ctx: MutationContext,
  ) {
    await this.requireConfigManage(ctx.actor, guildId);
    assertPingRoleIds(roleIds);
    return this.mutate(ctx, 'admin-ping-roles-put', `guild:${guildId}`, async (tx) => {
      const current = await tx.getSettings(guildId);
      if (current === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      if (expectedRevision !== undefined && current.configRevision !== expectedRevision) {
        throw new ActivityError('CONFLICT', 'Config revision mismatch');
      }
      const updated = await tx.putGuildAdminConfig(guildId, {
        expectedRevision: expectedRevision ?? current.configRevision,
        pingRoleIds: roleIds,
      });
      await this.audit(tx, ctx, guildId, 'admin.ping_roles.put', {
        roleCount: roleIds.length,
      });
      return updated;
    });
  }

  public async listEvents(
    guildId: string,
    actor: ActorSubject,
    filters: {
      status?: string;
      organizerDiscordUserId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
    },
  ) {
    await this.requireManageGuild(actor, guildId);
    return this.deps.repository.withTransaction((tx) =>
      tx.listAdminEvents({
        guildId,
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.organizerDiscordUserId !== undefined
          ? { organizerDiscordUserId: filters.organizerDiscordUserId }
          : {}),
        ...(filters.from !== undefined ? { from: filters.from } : {}),
        ...(filters.to !== undefined ? { to: filters.to } : {}),
        limit: Math.min(filters.limit ?? 50, 200),
        offset: filters.offset ?? 0,
      }),
    );
  }

  public async getEvent(guildId: string, activityId: string, actor: ActorSubject) {
    await this.requireManageGuild(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null || activity.guildId !== guildId || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      const participations = await tx.listParticipations(activityId);
      const projection = await tx.getActivityProjection(activityId);
      return { activity, participations, projection };
    });
  }

  public async listProjectionProblems(guildId: string, actor: ActorSubject) {
    await this.requirePanelManage(actor, guildId);
    return this.deps.repository.withTransaction((tx) => tx.listProjectionProblems(guildId));
  }

  public async requestProjectionScan(guildId: string, ctx: MutationContext) {
    await this.requirePanelManage(ctx.actor, guildId);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'admin-projections-scan', `guild:${guildId}`, async (tx) => {
      const problems = await tx.listProjectionProblems(guildId);
      for (const projection of problems) {
        const activity = await tx.getActivity(projection.activityId);
        if (activity === null) {
          continue;
        }
        await tx.upsertActivityProjection({
          activityId: activity.id,
          guildId: activity.guildId,
          channelId: activity.publicationChannelId ?? projection.channelId,
          opaqueId: activity.opaqueId,
          status: 'pending',
        });
        await tx.insertOutbox({
          eventType: OUTBOX_EVENT_TYPES.PROJECTION_REQUESTED,
          aggregateType: 'activity',
          aggregateId: activity.id,
          aggregateVersion: activity.version,
          payload: {
            activityId: activity.id,
            opaqueId: activity.opaqueId,
            guildId: activity.guildId,
            channelId: activity.publicationChannelId ?? projection.channelId,
          },
          occurredAt: now,
        });
      }
      await this.audit(tx, ctx, guildId, 'admin.projections.scan', {
        requested: problems.length,
      });
      return { requested: problems.length };
    });
  }

  public async repairProjection(guildId: string, activityId: string, ctx: MutationContext) {
    await this.requirePanelManage(ctx.actor, guildId);
    const now = this.deps.clock.now();
    return this.mutate(ctx, 'admin-projection-repair', `guild:${guildId}`, async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null || activity.guildId !== guildId) {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      const channelId = activity.publicationChannelId ?? '';
      const projection = await tx.upsertActivityProjection({
        activityId: activity.id,
        guildId: activity.guildId,
        channelId,
        opaqueId: activity.opaqueId,
        status: 'pending',
      });
      await tx.insertOutbox({
        eventType: OUTBOX_EVENT_TYPES.PANEL_PROJECTION_REPAIRED,
        aggregateType: 'activity',
        aggregateId: activity.id,
        aggregateVersion: activity.version,
        payload: {
          activityId: activity.id,
          opaqueId: activity.opaqueId,
          guildId: activity.guildId,
          channelId,
        },
        occurredAt: now,
      });
      await this.audit(tx, ctx, guildId, 'admin.projection.repair', { activityId }, activityId);
      return projection;
    });
  }

  public async listAdminReports(
    guildId: string,
    actor: ActorSubject,
    status?: 'open' | 'resolved',
  ) {
    await this.requireReportManage(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const reports = await tx.listReports(guildId);
      return status === undefined ? reports : reports.filter((r) => r.status === status);
    });
  }

  public async updateAdminReport(
    guildId: string,
    reportId: string,
    status: 'open' | 'resolved',
    ctx: MutationContext,
  ) {
    await this.requireReportManage(ctx.actor, guildId);
    return this.mutate(ctx, 'admin-report-update', `guild:${guildId}`, async (tx) => {
      const updated = await tx.updateReportStatus(reportId, guildId, status);
      await this.audit(tx, ctx, guildId, 'admin.report.update', { reportId, status });
      return updated;
    });
  }

  public async listAudit(
    guildId: string,
    actor: ActorSubject,
    filters: {
      actionPrefix?: string;
      activityId?: string;
      actorDiscordUserId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
    },
  ) {
    await this.requireConfigManage(actor, guildId);
    return this.deps.repository.withTransaction((tx) =>
      tx.listAuditEntries({
        guildId,
        ...(filters.actionPrefix !== undefined ? { actionPrefix: filters.actionPrefix } : {}),
        ...(filters.activityId !== undefined ? { activityId: filters.activityId } : {}),
        ...(filters.actorDiscordUserId !== undefined
          ? { actorDiscordUserId: filters.actorDiscordUserId }
          : {}),
        ...(filters.from !== undefined ? { from: filters.from } : {}),
        ...(filters.to !== undefined ? { to: filters.to } : {}),
        limit: Math.min(filters.limit ?? 50, 200),
        offset: filters.offset ?? 0,
      }),
    );
  }

  public async getHubStatus(guildId: string, actor: ActorSubject) {
    await this.requirePanelManage(actor, guildId);
    return this.deps.repository.withTransaction(async (tx) => {
      const settings = await tx.getSettings(guildId);
      if (settings === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      const panels = await tx.listPanels(guildId);
      const hub = panels.find((p) => p.panelType === 'hub') ?? null;
      return {
        hubChannelId: settings.hubChannelId,
        configRevision: settings.configRevision,
        panel: hub,
      };
    });
  }

  public async publishHubIntent(
    guildId: string,
    channelId: string,
    expectedRevision: number | undefined,
    ctx: MutationContext,
  ) {
    await this.requirePanelManage(ctx.actor, guildId);
    if (channelId.trim().length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'channelId is required');
    }
    return this.mutate(ctx, 'admin-hub-publish-intent', `guild:${guildId}`, async (tx) => {
      const current = await tx.getSettings(guildId);
      if (current === null) {
        throw new ActivityError('NOT_FOUND', 'Guild activity config not found');
      }
      if (expectedRevision !== undefined && current.configRevision !== expectedRevision) {
        throw new ActivityError('CONFLICT', 'Config revision mismatch');
      }
      const updated = await tx.putGuildAdminConfig(guildId, {
        expectedRevision: expectedRevision ?? current.configRevision,
        hubChannelId: channelId.trim(),
      });
      await this.audit(tx, ctx, guildId, 'admin.hub.publish_intent', {
        channelId: channelId.trim(),
      });
      return {
        hubChannelId: updated.hubChannelId,
        configRevision: updated.configRevision,
        note: 'Desired hub channel stored; Discord publish remains gateway responsibility',
      };
    });
  }

  /** Expose activity detail shape for cancel/takeover permission checks by guild. */
  public async assertActivityInGuild(guildId: string, activityId: string): Promise<ActivityRecord> {
    return this.deps.repository.withTransaction(async (tx) => {
      const activity = await tx.getActivity(activityId);
      if (activity === null || activity.guildId !== guildId || activity.status === 'deleted') {
        throw new ActivityError('NOT_FOUND', 'Activity not found');
      }
      return activity;
    });
  }
}
