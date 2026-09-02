'use client';

import { useMemo, useState } from 'react';

import {
  applyQuickActionOutcome,
  getDashboardSummary,
  type MemberDashboardSnapshot,
  type QuickAction,
  type QuickActionOutcome,
} from '../src/member-dashboard';

type IconName =
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
  | 'search'
  | 'settings'
  | 'team'
  | 'x';

const iconPaths: Record<IconName, readonly string[]> = {
  activity: ['M3 12h4l2.4-6 4.1 12L16 12h5'],
  bell: [
    'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9',
    'M10 21h4',
  ],
  character: [
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    'M4 21a8 8 0 0 1 16 0',
  ],
  check: ['m5 12 4 4L19 6'],
  chevron: ['m9 18 6-6-6-6'],
  clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  equipment: [
    'M14.5 4.5 19 9l-10 10H5v-4L15 5',
    'm13 7 4 4',
  ],
  history: [
    'M3 12a9 9 0 1 0 3-6.7L3 8',
    'M3 3v5h5',
    'M12 7v5l4 2',
  ],
  home: ['M3 11 12 3l9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  map: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z', 'M9 3v15', 'M15 6v15'],
  market: ['M4 10h16l-2-6H6Z', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
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

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
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

const navigation = [
  { label: 'Pulpit', icon: 'home', active: true },
  { label: 'Zespoły', icon: 'team', active: false },
  { label: 'Postacie', icon: 'character', active: false },
  { label: 'Mapy', icon: 'map', active: false },
  { label: 'Targ', icon: 'market', active: false },
  { label: 'Aktywność', icon: 'activity', active: false },
] as const satisfies ReadonlyArray<{ label: string; icon: IconName; active: boolean }>;

function StatusPill({ action }: { action: QuickAction }) {
  const labels: Record<QuickAction['status'], string> = {
    ready: action.dueLabel,
    upcoming: action.dueLabel,
    done: 'Zrobione',
    snoozed: 'Później',
    unavailable: 'Nie mogę',
  };

  return <span className={`status-pill is-${action.status}`}>{labels[action.status]}</span>;
}

export function MemberDashboard({
  initialSnapshot,
}: {
  initialSnapshot: MemberDashboardSnapshot;
}) {
  const [actions, setActions] = useState(initialSnapshot.quickActions);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const snapshot = useMemo(
    () => ({ ...initialSnapshot, quickActions: actions }),
    [actions, initialSnapshot],
  );
  const summary = useMemo(() => getDashboardSummary(snapshot), [snapshot]);

  const handleAction = (action: QuickAction, outcome: QuickActionOutcome) => {
    setActions((current) => applyQuickActionOutcome(current, action.id, outcome));
    const messages: Record<QuickActionOutcome, string> = {
      done: `${action.title} dla ${action.characterName}: oznaczono jako zrobione.`,
      snoozed: `${action.title} dla ${action.characterName}: przypomnienie odłożone.`,
      unavailable: `${action.title} dla ${action.characterName}: zgłoszono brak możliwości wykonania.`,
    };
    setAnnouncement(messages[outcome]);
  };

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

        <a aria-label="DESTILED — pulpit" className="brand" href="#main-content">
          <img alt="" className="brand-mark" src="/brand/destiled-mark.jpg" />
          <span className="brand-word">DESTILED</span>
        </a>

        <nav aria-label="Główna nawigacja" className="global-nav">
          {navigation.map((item) => (
            <button
              aria-current={item.active ? 'page' : undefined}
              className="global-nav-item"
              disabled={!item.active}
              key={item.label}
              title={item.active ? undefined : 'Ten obszar powstanie w kolejnym etapie'}
              type="button"
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button aria-label="Szukaj" className="icon-button" disabled type="button">
            <Icon name="search" />
          </button>
          <button aria-label="Powiadomienia" className="icon-button notification-button" type="button">
            <Icon name="bell" />
            <span className="notification-dot" />
          </button>
          <button aria-label="Ustawienia konta" className="profile-button" type="button">
            <span className="profile-avatar">M</span>
            <span className="profile-copy">
              <strong>{initialSnapshot.viewerName}</strong>
              <small>Członek</small>
            </span>
            <Icon name="chevron" size={15} />
          </button>
        </div>
      </header>

      <aside className={`mobile-drawer${mobileMenuOpen ? ' is-open' : ''}`}>
        {navigation.map((item) => (
          <button
            aria-current={item.active ? 'page' : undefined}
            className="drawer-item"
            disabled={!item.active}
            key={item.label}
            type="button"
          >
            <Icon name={item.icon} />
            {item.label}
            {!item.active && <small>później</small>}
          </button>
        ))}
      </aside>

      <main className="dashboard" id="main-content">
        <section className="welcome-panel">
          <div className="welcome-art" />
          <div className="welcome-content">
            <span className="eyebrow">Pulpit członka</span>
            <h1>Witaj ponownie, {initialSnapshot.viewerName}</h1>
            <p>
              Najważniejsze informacje Twojego zespołu w jednym miejscu — bez szukania po
              Discordzie i bez zgadywania, kto ostatnio coś zrobił.
            </p>
            <div className="welcome-meta">
              <span className="live-dot" />
              <strong>{initialSnapshot.teamName}</strong>
              <span>{summary.onlineMembers} osoby online</span>
            </div>
          </div>
          <div className="welcome-stat">
            <span>Do zrobienia</span>
            <strong>{summary.readyActions}</strong>
            <small>potwierdzenia</small>
          </div>
        </section>

        <section aria-label="Szybkie podsumowanie" className="metric-grid">
          <article className="metric-card is-red">
            <span className="metric-icon"><Icon name="clock" /></span>
            <div><strong>{summary.readyActions}</strong><span>gotowe akcje</span></div>
            <small>wymagają decyzji</small>
          </article>
          <article className="metric-card is-blue">
            <span className="metric-icon"><Icon name="team" /></span>
            <div><strong>{summary.onlineMembers}</strong><span>osoby online</span></div>
            <small>w zespole {initialSnapshot.teamName}</small>
          </article>
          <article className="metric-card is-silver">
            <span className="metric-icon"><Icon name="equipment" /></span>
            <div><strong>{summary.readyEquipmentSets}</strong><span>gotowy set</span></div>
            <small>sprawdzony układ EQ</small>
          </article>
          <article className="metric-card is-violet">
            <span className="metric-icon"><Icon name="character" /></span>
            <div><strong>{summary.totalCharacters}</strong><span>postacie</span></div>
            <small>w tej przestrzeni</small>
          </article>
        </section>

        <div className="dashboard-grid">
          <section className="panel attention-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Twoja kolejka</span>
                <h2>Do zrobienia teraz</h2>
              </div>
              <span className="count-badge">{summary.readyActions}</span>
            </header>
            <div className="action-list">
              {actions.map((action) => {
                const canRespond = action.status === 'ready';
                return (
                  <article className={`action-card tone-${action.tone}`} key={action.id}>
                    <span className="action-rail" />
                    <div className="action-icon"><Icon name={action.title.startsWith('Set') ? 'equipment' : 'clock'} /></div>
                    <div className="action-copy">
                      <div className="action-title-row">
                        <div>
                          <strong>{action.title}</strong>
                          <span>{action.characterName}</span>
                        </div>
                        <StatusPill action={action} />
                      </div>
                      <p>{action.description}</p>
                      {canRespond && (
                        <div className="action-controls">
                          <button
                            className="text-button is-confirm"
                            onClick={() => handleAction(action, 'done')}
                            type="button"
                          >
                            <Icon name="check" size={15} /> Zrobione
                          </button>
                          <button
                            className="text-button"
                            onClick={() => handleAction(action, 'snoozed')}
                            type="button"
                          >
                            <Icon name="clock" size={15} /> Później
                          </button>
                          <button
                            className="text-button"
                            onClick={() => handleAction(action, 'unavailable')}
                            type="button"
                          >
                            Nie mogę
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="panel team-panel" id="team-overview">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Aktywna przestrzeń</span>
                <h2>{initialSnapshot.teamName}</h2>
              </div>
              <button aria-label="Ustawienia zespołu" className="quiet-icon-button" disabled type="button">
                <Icon name="settings" size={17} />
              </button>
            </header>
            <div className="member-stack" aria-label="Członkowie zespołu">
              {initialSnapshot.teamMembers.map((member) => (
                <div className="member-row" key={member.id}>
                  <span className={`member-avatar is-${member.state}`}>{member.initials}</span>
                  <span className="member-name">{member.displayName}</span>
                  <span className={`presence is-${member.state}`}>
                    {member.state === 'online' ? 'online' : member.state === 'away' ? 'zaraz wracam' : 'offline'}
                  </span>
                </div>
              ))}
            </div>
            <button className="primary-button" disabled type="button">
              Otwórz przestrzeń zespołu
              <span>Następny ekran</span>
            </button>
          </aside>

          <section className="panel characters-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Zespół {initialSnapshot.teamName}</span>
                <h2>Postacie</h2>
              </div>
              <button className="quiet-link" disabled type="button">Zobacz wszystkie</button>
            </header>
            <div className="character-grid">
              {initialSnapshot.characters.map((character, index) => (
                <article className={`character-card accent-${index % 3}`} key={character.id}>
                  <div className="character-figure">
                    <img alt={`${character.classLabel} — ${character.name}`} src={character.imagePath} />
                  </div>
                  <div className="character-body">
                    <div>
                      <span>{character.classLabel} · poziom {character.level}</span>
                      <h3>{character.name}</h3>
                    </div>
                    <div className="character-tags">
                      <span>{character.equipmentCount}/{character.equipmentCapacity} EQ</span>
                      <span className={character.readyTimers > 0 ? 'is-ready' : ''}>
                        {character.readyTimers > 0 ? `${character.readyTimers} timer gotowy` : 'timery w toku'}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="panel history-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Ostatnie potwierdzenia</span>
                <h2>Historia zmian</h2>
              </div>
              <Icon name="history" size={18} />
            </header>
            <div className="history-list">
              {initialSnapshot.history.map((entry) => (
                <article className="history-row" key={entry.id}>
                  <span className={`history-icon is-${entry.kind}`}>
                    <Icon
                      name={entry.kind === 'equipment' ? 'equipment' : entry.kind === 'timer' ? 'clock' : 'team'}
                      size={15}
                    />
                  </span>
                  <div><strong>{entry.title}</strong><span>{entry.detail}</span></div>
                  <time>{entry.timeLabel}</time>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">{announcement}</p>
        <div className="mock-notice">
          Interfejs produkcyjny · dane demonstracyjne z adaptera. Zapis do API i Discorda zostanie podłączony bez zmiany tego widoku.
        </div>
      </main>
    </div>
  );
}
