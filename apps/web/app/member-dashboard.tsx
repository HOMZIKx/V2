'use client';

import { useMemo, useState } from 'react';

import {
  applyQuickActionOutcome,
  getDashboardSummary,
  type MemberDashboardSnapshot,
  type QuickAction,
  type QuickActionOutcome,
} from '../src/member-dashboard';

import { AppShell, Icon } from './app-shell';

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

export function MemberDashboard({ initialSnapshot }: { initialSnapshot: MemberDashboardSnapshot }) {
  const [actions, setActions] = useState(initialSnapshot.quickActions);
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
    <AppShell activeSection="dashboard" viewerName={initialSnapshot.viewerName}>
      <main className="dashboard" id="main-content">
        <section className="welcome-panel">
          <div className="welcome-art" />
          <div className="welcome-content">
            <span className="eyebrow">Pulpit członka</span>
            <h1>Witaj ponownie, {initialSnapshot.viewerName}</h1>
            <p>
              Najważniejsze informacje Twojego zespołu w jednym miejscu — bez szukania po Discordzie
              i bez zgadywania, kto ostatnio coś zrobił.
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
            <span className="metric-icon">
              <Icon name="clock" />
            </span>
            <div>
              <strong>{summary.readyActions}</strong>
              <span>gotowe akcje</span>
            </div>
            <small>wymagają decyzji</small>
          </article>
          <article className="metric-card is-blue">
            <span className="metric-icon">
              <Icon name="team" />
            </span>
            <div>
              <strong>{summary.onlineMembers}</strong>
              <span>osoby online</span>
            </div>
            <small>w zespole {initialSnapshot.teamName}</small>
          </article>
          <article className="metric-card is-silver">
            <span className="metric-icon">
              <Icon name="equipment" />
            </span>
            <div>
              <strong>{summary.readyEquipmentSets}</strong>
              <span>gotowy set</span>
            </div>
            <small>sprawdzony układ EQ</small>
          </article>
          <article className="metric-card is-violet">
            <span className="metric-icon">
              <Icon name="character" />
            </span>
            <div>
              <strong>{summary.totalCharacters}</strong>
              <span>postacie</span>
            </div>
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
                    <div className="action-icon">
                      <Icon name={action.title.startsWith('Set') ? 'equipment' : 'clock'} />
                    </div>
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
              <button
                aria-label="Ustawienia zespołu"
                className="quiet-icon-button"
                disabled
                type="button"
              >
                <Icon name="settings" size={17} />
              </button>
            </header>
            <div className="member-stack" aria-label="Członkowie zespołu">
              {initialSnapshot.teamMembers.map((member) => (
                <div className="member-row" key={member.id}>
                  <span className={`member-avatar is-${member.state}`}>{member.initials}</span>
                  <span className="member-name">{member.displayName}</span>
                  <span className={`presence is-${member.state}`}>
                    {member.state === 'online'
                      ? 'online'
                      : member.state === 'away'
                        ? 'zaraz wracam'
                        : 'offline'}
                  </span>
                </div>
              ))}
            </div>
            <a className="primary-button" href="/teams">
              Otwórz przestrzeń zespołu
              <span>Przejdź</span>
            </a>
          </aside>

          <section className="panel characters-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Zespół {initialSnapshot.teamName}</span>
                <h2>Postacie</h2>
              </div>
              <button className="quiet-link" disabled type="button">
                Zobacz wszystkie
              </button>
            </header>
            <div className="character-grid">
              {initialSnapshot.characters.map((character, index) => (
                <article className={`character-card accent-${index % 3}`} key={character.id}>
                  <div className="character-figure">
                    <img
                      alt={`${character.classLabel} — ${character.name}`}
                      src={character.imagePath}
                    />
                  </div>
                  <div className="character-body">
                    <div>
                      <span>
                        {character.classLabel} · poziom {character.level}
                      </span>
                      <h3>{character.name}</h3>
                    </div>
                    <div className="character-tags">
                      <span>
                        {character.equipmentCount}/{character.equipmentCapacity} EQ
                      </span>
                      <span className={character.readyTimers > 0 ? 'is-ready' : ''}>
                        {character.readyTimers > 0
                          ? `${character.readyTimers} timer gotowy`
                          : 'timery w toku'}
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
                      name={
                        entry.kind === 'equipment'
                          ? 'equipment'
                          : entry.kind === 'timer'
                            ? 'clock'
                            : 'team'
                      }
                      size={15}
                    />
                  </span>
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{entry.detail}</span>
                  </div>
                  <time>{entry.timeLabel}</time>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mock-notice">
          Interfejs produkcyjny · dane demonstracyjne z adaptera. Zapis do API i Discorda zostanie
          podłączony bez zmiany tego widoku.
        </div>
      </main>
    </AppShell>
  );
}
