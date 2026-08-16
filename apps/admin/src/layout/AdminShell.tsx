import { NavLink, Outlet, useLocation } from 'react-router';

import { isDevActorMode, readAdminSession } from '../auth/session.js';
import { GuildProvider, useGuildContext } from './GuildContext.js';

const ACTIVITY_NAV: readonly { readonly to: string; readonly label: string }[] = [
  { to: '/activity', label: 'Overview' },
  { to: '/activity/types', label: 'Types' },
  { to: '/activity/statuses', label: 'Statuses' },
  { to: '/activity/fields', label: 'Fields' },
  { to: '/activity/channels', label: 'Channels' },
  { to: '/activity/pings', label: 'Pings' },
  { to: '/activity/limits', label: 'Limits' },
  { to: '/activity/notifications', label: 'Notifications' },
  { to: '/activity/report-reasons', label: 'Report reasons' },
  { to: '/activity/events', label: 'Events' },
  { to: '/activity/projections', label: 'Projections' },
  { to: '/activity/reports', label: 'Reports' },
  { to: '/activity/audit', label: 'Audit' },
  { to: '/activity/hub', label: 'Hub' },
];

function GuildSelector() {
  const { guildId, guilds, setGuildId, loadingGuilds } = useGuildContext();
  const location = useLocation();
  const onActivity = location.pathname.startsWith('/activity');

  if (!onActivity) {
    return null;
  }

  if (loadingGuilds) {
    return <div className="guild-selector muted">Loading guilds…</div>;
  }

  if (guilds.length === 0) {
    return (
      <div className="guild-selector muted">
        No guilds configured. Set <code>VITE_ADMIN_DEV_GUILDS</code> or expose GET
        /activity/v1/admin/guilds.
      </div>
    );
  }

  return (
    <div className="guild-selector">
      <label htmlFor="guild-select">Guild</label>
      <select
        id="guild-select"
        value={guildId ?? ''}
        onChange={(event) => {
          setGuildId(event.target.value);
        }}
      >
        {guilds.map((guild) => (
          <option key={guild.id} value={guild.id}>
            {guild.name} ({guild.id})
          </option>
        ))}
      </select>
    </div>
  );
}

function ShellChrome() {
  const session = readAdminSession();
  const { guildId } = useGuildContext();
  const location = useLocation();
  const onActivity = location.pathname.startsWith('/activity');

  return (
    <div className="admin-shell">
      {isDevActorMode(session) ? (
        <div className="dev-banner" role="status">
          DEV actor mode — Discord user <code>{session.actorDiscordUserId}</code>. Production uses
          Identity session cookies via the API gateway (
          <code>credentials: &apos;include&apos;</code>).
        </div>
      ) : null}

      <div className="admin-shell-body">
        <aside className="admin-nav">
          <div className="nav-brand">V2 Admin</div>
          <nav aria-label="Admin">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Status
            </NavLink>
            <div className="nav-section">Centrum Aktywności</div>
            {ACTIVITY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/activity'}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="admin-main">
          <GuildSelector />
          {onActivity ? (
            <div key={guildId ?? 'no-guild'} className="admin-outlet">
              <Outlet />
            </div>
          ) : (
            <div className="admin-outlet">
              <Outlet />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminShell() {
  return (
    <GuildProvider>
      <ShellChrome />
    </GuildProvider>
  );
}
