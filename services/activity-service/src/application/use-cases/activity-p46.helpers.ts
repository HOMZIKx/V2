import { randomUUID } from 'node:crypto';

import { ActivityError } from '../../domain/errors.js';
import { scheduledFinishAt } from '../../domain/lifecycle.js';
import { opaqueIdFromUuid } from '../../domain/opaque-id.js';
import { assertPrivateAccessAllowed, type ActivityVisibility } from '../../domain/privacy.js';
import {
  assertSeriesHorizon,
  expandSeriesOccurrenceStarts,
  type RecurrenceKind,
  type SeriesCancelScope,
  type SeriesEditScope,
  type SeriesRsvpScope,
} from '../../domain/series.js';
import type {
  ActivityRecord,
  ActivitySeriesRecord,
  ActivityTx,
  ActorSubject,
  AttendanceRecord,
} from '../ports/activity.ports.js';

export type { SeriesCancelScope, SeriesEditScope, SeriesRsvpScope };

export type SeriesPublishInput = {
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string;
  readonly firstStartAt: Date;
  readonly endAtOffsetMs?: number | null;
  readonly recurrenceKind: RecurrenceKind;
  readonly weekdays?: readonly number[];
  readonly horizonEndAt: Date;
  readonly participantLimit?: number | null;
  readonly publicationChannelId?: string;
  readonly timezone?: string;
  readonly locationText?: string | null;
  readonly typeId?: string | null;
  readonly visibility?: ActivityVisibility;
  readonly privateRoleIds?: readonly string[];
};

export function buildSeriesOccurrences(input: {
  readonly recurrenceKind: RecurrenceKind;
  readonly firstStartAt: Date;
  readonly horizonEndAt: Date;
  readonly weekdays?: readonly number[];
  readonly endAtOffsetMs?: number | null;
  readonly now: Date;
}): { starts: Date[]; endAts: (Date | null)[] } {
  assertSeriesHorizon(input.firstStartAt, input.horizonEndAt, input.now);
  const starts = expandSeriesOccurrenceStarts({
    kind: input.recurrenceKind,
    firstStartAt: input.firstStartAt,
    horizonEndAt: input.horizonEndAt,
    ...(input.weekdays !== undefined ? { weekdays: input.weekdays } : {}),
  });
  if (starts.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'Series produced no occurrences');
  }
  const offset = input.endAtOffsetMs ?? null;
  const endAts = starts.map((start) =>
    offset === null ? null : new Date(start.getTime() + offset),
  );
  return { starts, endAts };
}

export function canViewPrivateActivity(input: {
  readonly activity: ActivityRecord;
  readonly actor: ActorSubject;
  readonly memberRoleIds?: readonly string[];
  readonly inviteToken?: string;
}): boolean {
  if (input.activity.visibility !== 'private') {
    return true;
  }
  const discordUserId = input.actor.discordUserId;
  if (
    discordUserId !== undefined &&
    (discordUserId === input.activity.organizerDiscordUserId ||
      discordUserId === input.activity.coOrganizerDiscordUserId)
  ) {
    return true;
  }
  return assertPrivateAccessAllowed({
    visibility: input.activity.visibility,
    memberRoleIds: input.memberRoleIds ?? [],
    allowedRoleIds: input.activity.privateRoleIds,
    inviteTokenHash: input.activity.privateInviteTokenHash,
    ...(input.inviteToken !== undefined ? { inviteToken: input.inviteToken } : {}),
  });
}

export function summarizeAttendance(records: readonly AttendanceRecord[]): {
  present: number;
  absent: number;
  total: number;
} {
  let present = 0;
  let absent = 0;
  for (const record of records) {
    if (record.status === 'present') {
      present += 1;
    } else {
      absent += 1;
    }
  }
  return { present, absent, total: records.length };
}

export async function insertSeriesWithOccurrences(
  tx: ActivityTx,
  input: {
    readonly seriesId: string;
    readonly draftGuildId: string;
    readonly organizationId: string;
    readonly discordUserId: string;
    readonly v2UserId: string | null;
    readonly publish: SeriesPublishInput;
    readonly starts: readonly Date[];
    readonly endAts: readonly (Date | null)[];
    readonly privateInviteTokenHash: string | null;
    readonly visibility: ActivityVisibility;
    readonly privateRoleIds: readonly string[];
    readonly organizerDefaultStatusId: string | null;
  },
): Promise<{ series: ActivitySeriesRecord; activities: ActivityRecord[] }> {
  const timeOfDay = input.starts[0]!.toISOString().slice(11, 19);
  const series = await tx.insertSeries({
    id: input.seriesId,
    organizationId: input.organizationId,
    homeGuildId: input.draftGuildId,
    creatorDiscordUserId: input.discordUserId,
    creatorV2UserId: input.v2UserId,
    recurrenceKind: input.publish.recurrenceKind,
    weekdays: input.publish.weekdays ?? [],
    timezone: input.publish.timezone ?? 'UTC',
    timeOfDay,
    horizonEndAt: input.publish.horizonEndAt,
    templatePayload: {
      name: input.publish.name,
      description: input.publish.description ?? '',
    },
    status: 'active',
  });

  const activities: ActivityRecord[] = [];
  for (let index = 0; index < input.starts.length; index += 1) {
    const startAt = input.starts[index]!;
    const endAt = input.endAts[index] ?? null;
    const activityId = randomUUID();
    const activity = await tx.insertActivity({
      id: activityId,
      guildId: input.draftGuildId,
      organizationId: input.organizationId,
      typeId: input.publish.typeId ?? null,
      name: input.publish.name,
      description: input.publish.description ?? '',
      startAt,
      endAt,
      scheduleKind: 'exact',
      periodKey: null,
      scheduleHasExplicitTime: true,
      status: 'registrations_open',
      enrollmentOpen: true,
      participantLimit: input.publish.participantLimit ?? null,
      participantMode: 'shared',
      seriesId: series.id,
      seriesOccurrenceIndex: index,
      visibility: input.visibility,
      privateInviteTokenHash: input.privateInviteTokenHash,
      privateRoleIds: input.privateRoleIds,
      organizerDiscordUserId: input.discordUserId,
      organizerV2UserId: input.v2UserId,
      coOrganizerDiscordUserId: null,
      coOrganizerV2UserId: null,
      publicationChannelId: input.publish.publicationChannelId ?? null,
      timezone: input.publish.timezone ?? 'UTC',
      locationText: input.publish.locationText ?? null,
      cancelReason: null,
      cancelledAt: null,
      scheduledFinishAt: scheduledFinishAt(startAt, endAt),
      opaqueId: opaqueIdFromUuid(activityId),
    });
    if (input.organizerDefaultStatusId !== null) {
      await tx.upsertParticipation({
        id: randomUUID(),
        activityId: activity.id,
        discordUserId: input.discordUserId,
        v2UserId: input.v2UserId,
        statusDefId: input.organizerDefaultStatusId,
        confirmationState: 'confirmed',
        reconfirmDeadline: null,
        waitlistPosition: null,
        scopeGuildId: null,
      });
    }
    activities.push(activity);
  }
  return { series, activities };
}
