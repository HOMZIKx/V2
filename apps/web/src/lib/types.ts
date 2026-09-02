export type ActivityLifecycle = string;

export type StatusBehavior = string;

export interface ActivityDto {
  readonly id: string;
  readonly guildId: string;
  readonly organizationId?: string;
  readonly typeId: string | null;
  readonly name: string;
  readonly description: string;
  readonly startAt: string;
  readonly endAt: string | null;
  readonly status: ActivityLifecycle;
  readonly enrollmentOpen: boolean;
  readonly participantLimit: number | null;
  readonly organizerDiscordUserId: string | null;
  readonly organizerV2UserId: string | null;
  readonly coOrganizerDiscordUserId: string | null;
  readonly coOrganizerV2UserId: string | null;
  readonly publicationChannelId: string | null;
  readonly timezone: string;
  readonly locationText: string | null;
  readonly cancelReason: string | null;
  readonly cancelledAt: string | null;
  readonly opaqueId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly occupiedSlots?: number;
  readonly typeLabel?: string | null;
  readonly organizerDisplay?: string | null;
  readonly coOrganizerDisplay?: string | null;
  readonly visibility?: 'public' | 'private';
  readonly seriesId?: string | null;
  readonly seriesOccurrenceIndex?: number | null;
  readonly myParticipationStatus?: {
    readonly statusDefId: string;
    readonly statusLabel: string;
    readonly confirmationState: 'confirmed' | 'requires_reconfirmation';
    readonly waitlistPosition: number | null;
  } | null;
}

export interface ParticipationDto {
  readonly id: string;
  readonly activityId: string;
  readonly discordUserId: string | null;
  readonly v2UserId: string | null;
  readonly statusDefId: string;
  readonly confirmationState: 'confirmed' | 'requires_reconfirmation';
  readonly reconfirmDeadline: string | null;
  readonly waitlistPosition: number | null;
  readonly resignedAt: string | null;
  readonly removedAt: string | null;
  readonly removeReason: string | null;
  readonly occupiesSlot: boolean;
  readonly statusBehavior: StatusBehavior;
  readonly displayName?: string | null;
}

export interface StatusDefDto {
  readonly id: string;
  readonly guildId?: string;
  readonly label: string;
  readonly occupiesSlot: boolean;
  readonly behavior: StatusBehavior;
  readonly selectableByMember: boolean;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly seedKey?: string | null;
}

export interface GuildConfigDto {
  readonly settings: Readonly<Record<string, unknown>>;
  readonly statuses: readonly StatusDefDto[];
}

export interface InboxItemDto {
  readonly id: string;
  readonly guildId: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface InboxListDto {
  readonly items: readonly InboxItemDto[];
  readonly nextCursor: string | null;
}

export interface SessionMeDto {
  readonly authenticated: true;
  readonly v2UserId: string;
  readonly discordUserId: string;
  readonly displayName?: string | null;
  readonly avatarUrl?: string | null;
}
