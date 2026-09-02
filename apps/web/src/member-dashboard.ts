export type MembershipRole = 'owner' | 'member';

// Warstwa pochodzenia pozostaje przy katalogu EQ. Nie opisuje dostępu do pulpitu
// ani tożsamości gracza.
export type CatalogLayer = 'project_hard_source' | 'destiled_curated' | 'team_private';

export interface MemberWorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly role: MembershipRole;
  readonly memberCount: number;
  readonly onlineCount: number;
  readonly updatedLabel: string;
}

export interface PendingWorkspaceInvitation {
  readonly id: string;
  readonly workspaceName: string;
  readonly invitedBy: string;
  readonly expiresLabel: string;
}

export interface MemberNotice {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly timeLabel: string;
  readonly kind: 'team' | 'invitation' | 'system';
  readonly unread: boolean;
  readonly href: string | null;
}

export interface MemberModuleAccess {
  readonly id: 'teams' | 'characters' | 'maps' | 'market' | 'activity';
  readonly label: string;
  readonly description: string;
  readonly href: string | null;
  readonly state: 'available' | 'coming';
}

export interface MemberDashboardSnapshot {
  readonly viewerName: string;
  readonly discordDisplayName: string;
  readonly discordConnected: boolean;
  readonly workspaces: readonly MemberWorkspaceSummary[];
  readonly pendingInvitations: readonly PendingWorkspaceInvitation[];
  readonly notices: readonly MemberNotice[];
  readonly modules: readonly MemberModuleAccess[];
}

export interface MemberDashboardSummary {
  readonly workspaceCount: number;
  readonly pendingInvitationCount: number;
  readonly unreadNoticeCount: number;
  readonly availableModuleCount: number;
}

export const memberDashboardFixture: MemberDashboardSnapshot = {
  viewerName: 'Mateusz',
  discordDisplayName: 'Mateusz',
  discordConnected: true,
  workspaces: [
    {
      id: 'asteria',
      name: 'Asteria',
      description: 'Prywatna przestrzeń zespołu do wspólnej organizacji gry.',
      role: 'owner',
      memberCount: 4,
      onlineCount: 2,
      updatedLabel: 'przed chwilą',
    },
  ],
  pendingInvitations: [],
  notices: [
    {
      id: 'notice-team-note',
      title: 'Nowa notatka w Asteria',
      detail: 'XiaoHu dodał informację dla zespołu.',
      timeLabel: 'wczoraj 23:18',
      kind: 'team',
      unread: true,
      href: '/teams/asteria#notes',
    },
    {
      id: 'notice-discord-connected',
      title: 'Konto Discord połączone',
      detail: 'Dostęp do modułów będzie wynikał z ról i przyjętych zaproszeń.',
      timeLabel: 'stan konta',
      kind: 'system',
      unread: false,
      href: null,
    },
  ],
  modules: [
    {
      id: 'teams',
      label: 'Zespoły',
      description: 'Wspólne ustalenia, członkowie, historia i prywatne dane zespołu.',
      href: '/teams/asteria',
      state: 'available',
    },
    {
      id: 'characters',
      label: 'Postacie',
      description: 'Osobny obszar postaci, EQ, setów i timerów, jeśli masz do niego dostęp.',
      href: '/characters',
      state: 'available',
    },
    {
      id: 'maps',
      label: 'Mapy i metiny',
      description: 'Niezależne sesje polowania, markery i timery respawnu.',
      href: '/maps',
      state: 'available',
    },
    {
      id: 'market',
      label: 'Targ',
      description: 'Ogłoszenia i przedmioty dostępne zgodnie z uprawnieniami.',
      href: null,
      state: 'coming',
    },
    {
      id: 'activity',
      label: 'Aktywność',
      description: 'Eventy, obecność i statystyki widoczne dla Twojej roli.',
      href: '/activity',
      state: 'available',
    },
  ],
};

export const emptyMemberDashboardFixture: MemberDashboardSnapshot = {
  ...memberDashboardFixture,
  workspaces: [],
  pendingInvitations: [],
  notices: [],
  modules: memberDashboardFixture.modules.map((module) =>
    module.id === 'teams' || module.id === 'characters'
      ? { ...module, href: null, state: 'coming' as const }
      : module,
  ),
};

export function getMemberDashboardSummary(
  snapshot: MemberDashboardSnapshot,
): MemberDashboardSummary {
  return {
    workspaceCount: snapshot.workspaces.length,
    pendingInvitationCount: snapshot.pendingInvitations.length,
    unreadNoticeCount: snapshot.notices.filter((notice) => notice.unread).length,
    availableModuleCount: snapshot.modules.filter((module) => module.state === 'available').length,
  };
}
