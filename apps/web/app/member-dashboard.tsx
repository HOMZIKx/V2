'use client';

import {
  getMemberDashboardSummary,
  type MemberDashboardSnapshot,
  type MemberModuleAccess,
  type MemberNotice,
} from '../src/member-dashboard';

import { AppShell, Icon, type IconName } from './app-shell';

const moduleIcons: Record<MemberModuleAccess['id'], IconName> = {
  teams: 'team',
  characters: 'character',
  maps: 'map',
  market: 'market',
  activity: 'activity',
};

const noticeIcons: Record<MemberNotice['kind'], IconName> = {
  team: 'team',
  invitation: 'bell',
  system: 'settings',
};

export function MemberDashboard({ initialSnapshot }: { initialSnapshot: MemberDashboardSnapshot }) {
  const summary = getMemberDashboardSummary(initialSnapshot);

  return (
    <AppShell activeSection="dashboard" viewerName={initialSnapshot.viewerName}>
      <main className="account-dashboard" id="main-content">
        <section className="account-hero">
          <div className="account-hero-copy">
            <span className="eyebrow">Centrum gracza</span>
            <h1>Witaj, {initialSnapshot.viewerName}</h1>
            <p>
              Wybierz obszar, do którego masz dostęp. Konto nie musi należeć do zespołu ani mieć
              przypisanej postaci.
            </p>
          </div>
          <div className="account-identity-card">
            <span className="profile-avatar">
              {initialSnapshot.discordDisplayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <small>Konto Discord</small>
              <strong>{initialSnapshot.discordDisplayName}</strong>
              <span className={initialSnapshot.discordConnected ? 'is-connected' : ''}>
                <span className="live-dot" />
                {initialSnapshot.discordConnected ? 'Połączone' : 'Wymaga połączenia'}
              </span>
            </div>
          </div>
        </section>

        <section aria-label="Podsumowanie dostępu" className="account-metrics">
          <article>
            <span className="metric-icon is-blue">
              <Icon name="team" />
            </span>
            <div>
              <strong>{summary.workspaceCount}</strong>
              <span>{summary.workspaceCount === 1 ? 'przestrzeń' : 'przestrzenie'}</span>
            </div>
            <small>przyjęte członkostwa</small>
          </article>
          <article>
            <span className="metric-icon is-red">
              <Icon name="bell" />
            </span>
            <div>
              <strong>{summary.pendingInvitationCount}</strong>
              <span>zaproszenia</span>
            </div>
            <small>czekają na decyzję</small>
          </article>
          <article>
            <span className="metric-icon is-silver">
              <Icon name="activity" />
            </span>
            <div>
              <strong>{summary.unreadNoticeCount}</strong>
              <span>nowe informacje</span>
            </div>
            <small>bez mieszania z timerami postaci</small>
          </article>
          <article>
            <span className="metric-icon is-violet">
              <Icon name="check" />
            </span>
            <div>
              <strong>{summary.availableModuleCount}</strong>
              <span>dostępne moduły</span>
            </div>
            <small>wynik Twoich uprawnień</small>
          </article>
        </section>

        <div className="account-dashboard-grid">
          <section className="panel account-workspaces-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Prywatne przestrzenie</span>
                <h2>Moje zespoły</h2>
              </div>
              <span className="count-badge">{summary.workspaceCount}</span>
            </header>

            {initialSnapshot.workspaces.length > 0 ? (
              <div className="account-workspace-list">
                {initialSnapshot.workspaces.map((workspace) => (
                  <article className="account-workspace-card" key={workspace.id}>
                    <div className="account-workspace-mark">
                      <Icon name="team" size={22} />
                    </div>
                    <div className="account-workspace-copy">
                      <div>
                        <span>{workspace.role === 'owner' ? 'Właściciel' : 'Członek'}</span>
                        <h3>{workspace.name}</h3>
                      </div>
                      <p>{workspace.description}</p>
                      <div className="account-workspace-meta">
                        <span>
                          <span className="live-dot" /> {workspace.onlineCount} online
                        </span>
                        <span>{workspace.memberCount} członków</span>
                        <span>Aktualizacja {workspace.updatedLabel}</span>
                      </div>
                    </div>
                    <a href={`/teams/${workspace.id}`}>
                      Otwórz zespół <Icon name="chevron" size={14} />
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="account-empty-state">
                <span>
                  <Icon name="team" size={24} />
                </span>
                <div>
                  <h3>Nie należysz jeszcze do zespołu</h3>
                  <p>
                    To prawidłowy stan konta. Dostęp pojawi się dopiero po świadomym przyjęciu
                    zaproszenia.
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="panel account-invitations-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Dostęp</span>
                <h2>Zaproszenia</h2>
              </div>
              <Icon name="bell" size={17} />
            </header>
            {initialSnapshot.pendingInvitations.length > 0 ? (
              <div className="account-invitation-list">
                {initialSnapshot.pendingInvitations.map((invitation) => (
                  <article key={invitation.id}>
                    <strong>{invitation.workspaceName}</strong>
                    <span>Zaprasza: {invitation.invitedBy}</span>
                    <small>{invitation.expiresLabel}</small>
                    <a href={`/invitations/${invitation.id}`}>Podejmij decyzję</a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="account-compact-empty">
                <Icon name="check" size={18} />
                <div>
                  <strong>Brak oczekujących zaproszeń</strong>
                  <span>Nie musisz niczego zatwierdzać.</span>
                </div>
              </div>
            )}
          </aside>

          <section className="panel account-modules-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Nawigacja według uprawnień</span>
                <h2>Dostępne obszary</h2>
              </div>
            </header>
            <div className="account-module-grid">
              {initialSnapshot.modules.map((module) => {
                const content = (
                  <>
                    <span className="account-module-icon">
                      <Icon name={moduleIcons[module.id]} size={20} />
                    </span>
                    <div>
                      <strong>{module.label}</strong>
                      <p>{module.description}</p>
                    </div>
                    <span className="account-module-state">
                      {module.state === 'available' ? 'Dostępny' : 'W przygotowaniu'}
                    </span>
                  </>
                );

                return module.href ? (
                  <a
                    className="account-module-card is-available"
                    href={module.href}
                    key={module.id}
                  >
                    {content}
                  </a>
                ) : (
                  <article className="account-module-card" key={module.id}>
                    {content}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="panel account-notices-panel">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Konto i dostęp</span>
                <h2>Powiadomienia</h2>
              </div>
              <span className="count-badge">{summary.unreadNoticeCount}</span>
            </header>
            {initialSnapshot.notices.length > 0 ? (
              <div className="account-notice-list">
                {initialSnapshot.notices.map((notice) => {
                  const body = (
                    <>
                      <span className={`account-notice-icon is-${notice.kind}`}>
                        <Icon name={noticeIcons[notice.kind]} size={15} />
                      </span>
                      <div>
                        <strong>{notice.title}</strong>
                        <p>{notice.detail}</p>
                        <small>{notice.timeLabel}</small>
                      </div>
                      {notice.unread && <span className="notice-unread-dot" />}
                    </>
                  );

                  return notice.href ? (
                    <a href={notice.href} key={notice.id}>
                      {body}
                    </a>
                  ) : (
                    <article key={notice.id}>{body}</article>
                  );
                })}
              </div>
            ) : (
              <div className="account-compact-empty">
                <Icon name="bell" size={18} />
                <div>
                  <strong>Brak nowych informacji</strong>
                  <span>Najważniejsze zmiany pojawią się tutaj.</span>
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="mock-notice">
          Podgląd frontendowy · dostęp do zespołów i modułów pochodzi obecnie z adaptera
          demonstracyjnego. Docelowo określi go Discord Auth oraz RBAC.
        </div>
      </main>
    </AppShell>
  );
}
