import { countOccupiedSlots } from '../domain/capacity.js';
import type { ActivityStatus } from '../domain/lifecycle.js';
import { opaqueIdFromUuid } from '../domain/opaque-id.js';
import { buildSchedulePayloadFields } from '../domain/schedule.js';
import type {
  ActivityRecord,
  ActivityTypeRecord,
  ParticipationRecord,
  ParticipationStatusDefRecord,
} from './ports/activity.ports.js';

export type EventProjectionPayload = {
  readonly kind: 'event';
  readonly activityId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string | null;
  readonly opaqueEventId: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly statusLabel: string;
  readonly startAtIso: string;
  readonly endAtIso: string | null;
  readonly scheduleLabel: string;
  readonly scheduleKind: string;
  readonly periodKey: string | null;
  readonly locationText: string | null;
  readonly organizerLabel: string;
  readonly coOrganizerLabel: string | null;
  readonly description: string | null;
  readonly occupiedSlots: number;
  readonly participantLimit: number | null;
  readonly statusSummaries: ReadonlyArray<{ readonly label: string; readonly count: number }>;
  readonly participantPreview: readonly string[];
  readonly statusDefs: ReadonlyArray<{
    readonly opaqueId: string;
    readonly label: string;
    readonly occupiesSlot: boolean;
  }>;
  readonly rsvpDisabled: boolean;
  readonly secondaryDisabled: boolean;
  readonly visibility: 'public' | 'private';
  readonly seriesOccurrenceIndex: number | null;
  readonly remove: boolean;
};

export type RemoveProjectionPayload = {
  readonly kind: 'event';
  readonly activityId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly opaqueEventId: string;
  readonly remove: true;
};

const STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Szkic',
  published: 'Opublikowana',
  registrations_open: 'Zapisy otwarte',
  registrations_closed: 'Zapisy zamknięte',
  in_progress: 'W trakcie',
  completed: 'Zakończona',
  cancelled: 'Anulowana',
  deleted: 'Usunięta',
};

export function activityStatusLabel(status: ActivityStatus): string {
  return STATUS_LABELS[status];
}

function mentionOrFallback(discordUserId: string | null, fallback: string): string {
  if (discordUserId === null || discordUserId.trim().length === 0) {
    return fallback;
  }
  return `<@${discordUserId}>`;
}

function isOpenParticipation(row: ParticipationRecord): boolean {
  return row.resignedAt === null && row.removedAt === null && row.waitlistPosition === null;
}

/**
 * Full Discord event projection DTO (matches discord-gateway eventPayloadSchema).
 * Built in the same transaction as the domain mutation so Discord never lags on thin payloads.
 */
export function buildEventProjectionPayload(input: {
  readonly activity: ActivityRecord;
  readonly channelId: string;
  readonly opaqueEventId: string;
  readonly messageId: string | null;
  readonly types: readonly ActivityTypeRecord[];
  readonly statusDefs: readonly ParticipationStatusDefRecord[];
  readonly participations: readonly ParticipationRecord[];
  readonly participantLimit: number | null;
}): EventProjectionPayload | RemoveProjectionPayload | null {
  const { activity } = input;

  if (activity.status === 'deleted') {
    if (input.messageId === null || input.messageId.trim().length === 0) {
      // Nothing published on Discord yet — no projection work.
      return null;
    }
    return {
      kind: 'event',
      activityId: activity.id,
      guildId: activity.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      opaqueEventId: input.opaqueEventId,
      remove: true,
    };
  }

  const scheduleFields = buildSchedulePayloadFields({
    scheduleKind: activity.scheduleKind,
    periodKey: activity.periodKey,
    startAt: activity.startAt,
    endAt: activity.endAt,
    timeZone: activity.timezone,
    scheduleHasExplicitTime: activity.scheduleHasExplicitTime,
  });

  const typeLabel =
    activity.typeId !== null
      ? (input.types.find((type) => type.id === activity.typeId)?.label ?? 'Aktywność')
      : 'Aktywność';

  const statusById = new Map(input.statusDefs.map((status) => [status.id, status] as const));
  const openRows = input.participations.filter(isOpenParticipation);
  const summaryMap = new Map<string, number>();
  for (const row of openRows) {
    const label = statusById.get(row.statusDefId)?.label ?? 'Zapisany';
    summaryMap.set(label, (summaryMap.get(label) ?? 0) + 1);
  }

  const occupiedSlots = countOccupiedSlots(
    input.participations.map((row) => ({
      occupiesSlot: row.occupiesSlot,
      confirmationState: row.confirmationState,
      waitlistPosition: row.waitlistPosition,
      resignedAt: row.resignedAt,
      removedAt: row.removedAt,
    })),
  );

  const selectableStatuses = input.statusDefs
    .filter((status) => status.active && status.selectableByMember)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((status) => ({
      opaqueId: opaqueIdFromUuid(status.id),
      label: status.label,
      occupiesSlot: status.occupiesSlot,
    }));

  const terminal =
    activity.status === 'cancelled' ||
    activity.status === 'completed' ||
    activity.status === 'in_progress';
  const rsvpDisabled = terminal || !activity.enrollmentOpen;

  const preview = openRows
    .slice(0, 8)
    .map((row) =>
      row.discordUserId !== null && row.discordUserId.length > 0
        ? `<@${row.discordUserId}>`
        : 'Uczestnik',
    );

  return {
    kind: 'event',
    activityId: activity.id,
    guildId: activity.guildId,
    channelId: input.channelId,
    messageId: input.messageId,
    opaqueEventId: input.opaqueEventId,
    name: activity.name,
    typeLabel,
    statusLabel: activityStatusLabel(activity.status),
    startAtIso: scheduleFields.startAtIso,
    endAtIso: activity.endAt?.toISOString() ?? null,
    scheduleLabel: scheduleFields.scheduleLabel,
    scheduleKind: scheduleFields.scheduleKind,
    periodKey: scheduleFields.periodKey,
    locationText: activity.locationText,
    organizerLabel: mentionOrFallback(activity.organizerDiscordUserId, 'Organizator'),
    coOrganizerLabel:
      activity.coOrganizerDiscordUserId !== null
        ? mentionOrFallback(activity.coOrganizerDiscordUserId, 'Współorganizator')
        : null,
    description: activity.description.trim().length > 0 ? activity.description : null,
    occupiedSlots,
    participantLimit: input.participantLimit,
    statusSummaries: [...summaryMap.entries()].map(([label, count]) => ({ label, count })),
    participantPreview: preview,
    statusDefs: selectableStatuses,
    rsvpDisabled,
    secondaryDisabled: terminal,
    visibility: activity.visibility,
    seriesOccurrenceIndex: activity.seriesOccurrenceIndex,
    remove: false,
  };
}
