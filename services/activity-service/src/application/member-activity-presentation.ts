import { countOccupiedSlots } from '../domain/capacity.js';
import type {
  ActivityRecord,
  ActivityTypeRecord,
  ActorSubject,
  ParticipationRecord,
  ParticipationStatusDefRecord,
} from './ports/activity.ports.js';

export const UNKNOWN_MEMBER_DISPLAY = 'nieznany użytkownik';

export type MemberParticipationStatusView = {
  readonly statusDefId: string;
  readonly statusLabel: string;
  readonly confirmationState: 'confirmed' | 'requires_reconfirmation';
  readonly waitlistPosition: number | null;
};

export type MemberActivityListItem = Omit<ActivityRecord, 'version'> & {
  readonly occupiedSlots: number;
  readonly typeLabel: string | null;
  readonly organizerDisplay: string;
  readonly coOrganizerDisplay: string | null;
  readonly myParticipationStatus: MemberParticipationStatusView | null;
};

export function collectOrganizerDiscordIds(activities: readonly ActivityRecord[]): string[] {
  const ids = new Set<string>();
  for (const activity of activities) {
    if (activity.organizerDiscordUserId !== null && activity.organizerDiscordUserId.length > 0) {
      ids.add(activity.organizerDiscordUserId);
    }
    if (
      activity.coOrganizerDiscordUserId !== null &&
      activity.coOrganizerDiscordUserId.length > 0
    ) {
      ids.add(activity.coOrganizerDiscordUserId);
    }
  }
  return [...ids];
}

export function collectParticipantDiscordIds(
  participations: readonly ParticipationRecord[],
): string[] {
  const ids = new Set<string>();
  for (const row of participations) {
    if (row.discordUserId !== null && row.discordUserId.length > 0) {
      ids.add(row.discordUserId);
    }
  }
  return [...ids];
}

function isOpenParticipation(row: ParticipationRecord): boolean {
  return row.resignedAt === null && row.removedAt === null;
}

function matchesActor(row: ParticipationRecord, actor: ActorSubject): boolean {
  if (
    actor.discordUserId !== undefined &&
    row.discordUserId !== null &&
    row.discordUserId === actor.discordUserId
  ) {
    return true;
  }
  if (actor.v2UserId !== undefined && row.v2UserId !== null && row.v2UserId === actor.v2UserId) {
    return true;
  }
  return false;
}

export function myParticipationStatus(
  participations: readonly ParticipationRecord[],
  actor: ActorSubject,
  statusById: ReadonlyMap<string, ParticipationStatusDefRecord>,
): MemberParticipationStatusView | null {
  const mine = participations.find((row) => isOpenParticipation(row) && matchesActor(row, actor));
  if (mine === undefined) {
    return null;
  }
  return {
    statusDefId: mine.statusDefId,
    statusLabel: statusById.get(mine.statusDefId)?.label ?? 'Zapisany',
    confirmationState: mine.confirmationState,
    waitlistPosition: mine.waitlistPosition,
  };
}

export function toMemberActivityListItem(input: {
  activity: ActivityRecord;
  participations: readonly ParticipationRecord[];
  actor: ActorSubject;
  statusById: ReadonlyMap<string, ParticipationStatusDefRecord>;
  typeById: ReadonlyMap<string, ActivityTypeRecord>;
  displayByDiscordId: ReadonlyMap<string, string>;
}): MemberActivityListItem {
  const { activity } = input;
  const organizerDisplay =
    activity.organizerDiscordUserId !== null
      ? (input.displayByDiscordId.get(activity.organizerDiscordUserId) ?? UNKNOWN_MEMBER_DISPLAY)
      : UNKNOWN_MEMBER_DISPLAY;
  const coOrganizerDisplay =
    activity.coOrganizerDiscordUserId !== null
      ? (input.displayByDiscordId.get(activity.coOrganizerDiscordUserId) ?? UNKNOWN_MEMBER_DISPLAY)
      : null;
  const typeLabel =
    activity.typeId !== null ? (input.typeById.get(activity.typeId)?.label ?? null) : null;
  const { version: _ignoredVersion, ...publicActivity } = activity;
  void _ignoredVersion;
  return {
    ...publicActivity,
    occupiedSlots: countOccupiedSlots(
      input.participations.map((row) => ({
        occupiesSlot: row.occupiesSlot,
        confirmationState: row.confirmationState,
        waitlistPosition: row.waitlistPosition,
        resignedAt: row.resignedAt,
        removedAt: row.removedAt,
      })),
    ),
    typeLabel,
    organizerDisplay,
    coOrganizerDisplay,
    myParticipationStatus: myParticipationStatus(
      input.participations,
      input.actor,
      input.statusById,
    ),
  };
}
