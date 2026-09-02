export type ActivityRsvpBehavior = 'confirmed' | 'tentative' | 'declined';
export type ActivityScope = 'all' | 'mine' | 'joined' | 'organized';

export interface ActivityRsvpStatus {
  readonly id: ActivityRsvpBehavior;
  readonly label: 'Będę' | 'Może będę' | 'Nie będę';
  readonly occupiesSlot: boolean;
}

export interface ActivityParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly status: ActivityRsvpBehavior;
  readonly isViewer: boolean;
}

export interface GuildActivity {
  readonly id: string;
  readonly title: string;
  readonly typeName: string;
  readonly serverName: string;
  readonly channelName: string;
  readonly startsLabel: string;
  readonly durationLabel: string | null;
  readonly signupClosesLabel: string;
  readonly organizer: string;
  readonly coOrganizer: string | null;
  readonly capacity: number | null;
  readonly waitlistCount: number;
  readonly participants: readonly ActivityParticipant[];
  readonly description: string;
  readonly requiresReconfirmation: boolean;
  readonly viewerCanManage: boolean;
}

export interface ActivityNotification {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly timeLabel: string;
  readonly unread: boolean;
}

export interface ActivityCenterSnapshot {
  readonly viewerName: string;
  readonly statuses: readonly ActivityRsvpStatus[];
  readonly activities: readonly GuildActivity[];
  readonly notifications: readonly ActivityNotification[];
}

export interface ActivityCenterSummary {
  readonly upcomingCount: number;
  readonly joinedCount: number;
  readonly organizedCount: number;
  readonly unreadNotificationCount: number;
}

export const activityCenterFixture: ActivityCenterSnapshot = {
  viewerName: 'Mateusz',
  statuses: [
    { id: 'confirmed', label: 'Będę', occupiesSlot: true },
    { id: 'tentative', label: 'Może będę', occupiesSlot: false },
    { id: 'declined', label: 'Nie będę', occupiesSlot: false },
  ],
  activities: [
    {
      id: 'gild-war-thursday',
      title: 'Wojna gildii — Asteria',
      typeName: 'Event gildyjny',
      serverName: 'Projekt Hard',
      channelName: '#wojny',
      startsLabel: 'Dzisiaj · 20:30',
      durationLabel: 'około 90 min',
      signupClosesLabel: 'dzisiaj o 20:30',
      organizer: 'XiaoHu',
      coOrganizer: 'Wicek',
      capacity: 8,
      waitlistCount: 1,
      participants: [
        { id: 'mateusz', displayName: 'Mateusz', status: 'confirmed', isViewer: true },
        { id: 'xiaohu', displayName: 'XiaoHu', status: 'confirmed', isViewer: false },
        { id: 'wicek', displayName: 'Wicek', status: 'confirmed', isViewer: false },
        { id: 'aalpsik', displayName: 'Aalpsik', status: 'tentative', isViewer: false },
      ],
      description: 'Zbiórka przed bramą. Organizator potwierdzi skład na Discordzie.',
      requiresReconfirmation: false,
      viewerCanManage: false,
    },
    {
      id: 'world-boss-sunday',
      title: 'World Boss — Niedziela',
      typeName: 'World Boss',
      serverName: 'Projekt Hard',
      channelName: '#world-boss',
      startsLabel: 'Niedziela · 19:45',
      durationLabel: null,
      signupClosesLabel: 'niedziela o 19:45',
      organizer: 'Mateusz',
      coOrganizer: null,
      capacity: 12,
      waitlistCount: 0,
      participants: [
        { id: 'mateusz', displayName: 'Mateusz', status: 'confirmed', isViewer: true },
        { id: 'nerwnicht', displayName: 'NerwNicht', status: 'confirmed', isViewer: false },
      ],
      description: 'Wydarzenie opublikowane na Discordzie. Lista i limity są wspólne dla WWW i bota.',
      requiresReconfirmation: true,
      viewerCanManage: true,
    },
    {
      id: 'dungeon-friday',
      title: 'Wyprawa do lochu',
      typeName: 'Inna aktywność',
      serverName: 'Projekt Hard',
      channelName: '#wyprawy',
      startsLabel: 'Piątek · 21:00',
      durationLabel: 'około 2 godz.',
      signupClosesLabel: 'piątek o 21:00',
      organizer: 'Aalpsik',
      coOrganizer: null,
      capacity: 6,
      waitlistCount: 0,
      participants: [
        { id: 'aalpsik', displayName: 'Aalpsik', status: 'confirmed', isViewer: false },
      ],
      description: 'Skład i dodatkowe role uczestników zostaną ustalone w kanale wydarzenia.',
      requiresReconfirmation: false,
      viewerCanManage: false,
    },
  ],
  notifications: [
    {
      id: 'activity-date-changed',
      title: 'Termin wydarzenia został zmieniony',
      detail: 'World Boss — Niedziela wymaga ponownego potwierdzenia obecności.',
      timeLabel: 'przed 18 min',
      unread: true,
    },
    {
      id: 'activity-waitlist',
      title: 'Lista rezerwowa',
      detail: 'Wojna gildii — Asteria ma jedną osobę na liście rezerwowej.',
      timeLabel: 'dzisiaj 16:42',
      unread: false,
    },
  ],
};

export function getActivityCenterSummary(snapshot: ActivityCenterSnapshot): ActivityCenterSummary {
  return {
    upcomingCount: snapshot.activities.length,
    joinedCount: snapshot.activities.filter((activity) =>
      activity.participants.some((participant) => participant.isViewer && participant.status !== 'declined'),
    ).length,
    organizedCount: snapshot.activities.filter(
      (activity) => activity.organizer === snapshot.viewerName,
    ).length,
    unreadNotificationCount: snapshot.notifications.filter((notice) => notice.unread).length,
  };
}

export function getViewerRsvp(activity: GuildActivity): ActivityRsvpBehavior | null {
  return activity.participants.find((participant) => participant.isViewer)?.status ?? null;
}

export function getConfirmedParticipantCount(activity: GuildActivity): number {
  return activity.participants.filter((participant) => participant.status === 'confirmed').length;
}

export function filterActivities(
  activities: readonly GuildActivity[],
  scope: ActivityScope,
): readonly GuildActivity[] {
  if (scope === 'all') return activities;
  if (scope === 'mine') return activities.filter((activity) => getViewerRsvp(activity) !== null);
  if (scope === 'joined') {
    return activities.filter((activity) => {
      const rsvp = getViewerRsvp(activity);
      return rsvp !== null && rsvp !== 'declined';
    });
  }
  return activities.filter((activity) => activity.viewerCanManage);
}

export function updateViewerRsvp(
  activity: GuildActivity,
  status: ActivityRsvpBehavior,
  viewerName: string,
): GuildActivity {
  const viewer = activity.participants.find((participant) => participant.isViewer);
  const participants = viewer
    ? activity.participants.map((participant) =>
        participant.isViewer ? { ...participant, status } : participant,
      )
    : [...activity.participants, { id: 'viewer', displayName: viewerName, status, isViewer: true }];

  return { ...activity, participants };
}
