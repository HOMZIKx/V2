'use client';

import { useState, type ReactNode } from 'react';

import { usePlayerStore } from '../src/player-store-react';

export type AppSection =
  'dashboard' | 'teams' | 'characters' | 'timers' | 'maps' | 'market' | 'activity' | 'later';

export type IconName =
  | 'activity'
  | 'bell'
  | 'character'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'equipment'
  | 'history'
  | 'home'
  | 'map'
  | 'market'
  | 'menu'
  | 'note'
  | 'plus'
  | 'search'
  | 'settings'
  | 'team'
  | 'x';

const iconPaths: Record<IconName, readonly string[]> = {
  activity: ['M3 12h4l2.4-6 4.1 12L16 12h5'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  character: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  check: ['m5 12 4 4L19 6'],
  chevron: ['m9 18 6-6-6-6'],
  clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  equipment: ['M14.5 4.5 19 9l-10 10H5v-4L15 5', 'm13 7 4 4'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  home: ['M3 11 12 3l9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  map: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z', 'M9 3v15', 'M15 6v15'],
  market: ['M4 10h16l-2-6H6Z', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  note: ['M5 3h11l3 3v15H5Z', 'M16 3v4h4', 'M8 11h8', 'M8 15h6'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M20 20l-4-4', 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 3.6-.1-.1a1.7 1.7 0 0 0-1.8-.5 1.7 1.7 0 0 0-1.3 1.4v.1h-5v-.1A1.7 1.7 0 0 0 8.2 20a1.7 1.7 0 0 0-1.8.5l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.7-.9H3V10h.1a1.7 1.7 0 0 0 1.7-.9 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-3.6.1.1a1.7 1.7 0 0 0 1.8.5 1.7 1.7 0 0 0 1.3-1.4v-.1h5v.1A1.7 1.7 0 0 0 16 4.1a1.7 1.7 0 0 0 1.8-.5l.1-.1L20 7.1l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.7.9h.1v4.1h-.1a1.7 1.7 0 0 0-1.9.9Z',
  ],
  team: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M22 21v-2a4 4 0 0 0-3-3.9',
    'M16 3.1a4 4 0 0 1 0 7.8',
  ],
  x: ['M18 6 6 18', 'M6 6l12 12'],
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {iconPaths[name].map((path) => (
        <path
          d={path}
          key={path}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      ))}
    </svg>
  );
}

export function AppShell({
  activeSection,
  children,
  viewerName,
}: {
  activeSection: AppSection;
  children: ReactNode;
  viewerName: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { state } = usePlayerStore();
  const primaryWorkspaceId = state.lastOpenedWorkspaceId ?? state.workspaces[0]?.id ?? null;
  const teamsHref = primaryWorkspaceId ? `/teams/${primaryWorkspaceId}` : '/#first-use';
  const readyCount = state.workspaces.reduce(
    (count, workspace) =>
      count + workspace.timers.filter((timer) => timer.status === 'ready').length,
    0,
  );

  const connectionCopy =
    state.connection === 'connected'
      ? {
          title: 'Podgląd lokalny',
          detail: 'Dane w przeglądarce (localStorage). Pełna synchronizacja zespołu wymaga API.',
        }
      : state.connection === 'reconnecting'
        ? {
            title: 'Ponowne łączenie',
            detail: 'Wersje robocze zostają na urządzeniu.',
          }
        : state.connection === 'revoked'
          ? {
              title: 'Dostęp zakończony',
              detail: 'Sesja nie ma już uprawnień do prywatnych danych.',
            }
          : {
              title: 'Offline',
              detail: 'Brak aktywnego połączenia z backendem.',
            };

  const navigation = [
    { id: 'dashboard' as const, label: 'Pulpit', icon: 'home' as const, href: '/' },
    { id: 'teams' as const, label: 'Zespół', icon: 'team' as const, href: teamsHref },
    {
      id: 'characters' as const,
      label: 'Postacie',
      icon: 'character' as const,
      href: '/characters',
    },
    { id: 'timers' as const, label: 'Timery', icon: 'clock' as const, href: '/timers' },
    { id: 'maps' as const, label: 'Party', icon: 'map' as const, href: '/maps' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          aria-expanded={mobileMenuOpen}
          aria-label="Otwórz nawigację"
          className="icon-button mobile-menu-button"
          onClick={() => setMobileMenuOpen((current) => !current)}
          type="button"
        >
          <Icon name={mobileMenuOpen ? 'x' : 'menu'} />
        </button>

        <a aria-label="DESTILED — pulpit" className="brand" href="/">
          <img alt="" className="brand-mark" src="/brand/destiled-mark.jpg" />
          <span className="brand-word">DESTILED</span>
        </a>

        <nav aria-label="Główna nawigacja" className="global-nav">
          {navigation.map((item) => (
            <a
              aria-current={item.id === activeSection ? 'page' : undefined}
              className="global-nav-item"
              href={item.href}
              key={item.id}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-actions">
          <span className="topbar-later-pill" title="Późniejsze moduły poza pierwszym slice">
            Targ / Aktywność — później
          </span>
          <a
            aria-label={
              readyCount > 0
                ? `Pulpit: ${readyCount} gotowych timerów`
                : 'Pulpit — brak gotowych timerów'
            }
            className="icon-button notification-button"
            href="/"
          >
            <Icon name="bell" />
            {readyCount > 0 ? <span className="notification-dot" /> : null}
          </a>
          <a aria-label="Otwórz pulpit konta" className="profile-button" href="/">
            <span className="profile-avatar">{viewerName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy">
              <strong>{viewerName}</strong>
              <small>Discord</small>
            </span>
            <Icon name="chevron" size={15} />
          </a>
        </div>
      </header>

      <div
        aria-live="polite"
        className={`connection-strip is-${state.connection === 'connected' ? 'local' : state.connection}`}
      >
        <Icon name="activity" size={14} />
        <div className="connection-strip-copy">
          <strong>{connectionCopy.title}</strong>
          <span>{connectionCopy.detail}</span>
        </div>
      </div>

      <aside className={`mobile-drawer${mobileMenuOpen ? ' is-open' : ''}`}>
        {navigation.map((item) => (
          <a
            aria-current={item.id === activeSection ? 'page' : undefined}
            className="drawer-item"
            href={item.href}
            key={item.id}
          >
            <Icon name={item.icon} />
            {item.label}
          </a>
        ))}
        <p className="drawer-later">Targ i Aktywność wrócą w kolejnych etapach.</p>
      </aside>

      {children}
    </div>
  );
}
