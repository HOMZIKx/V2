import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { Button } from '@v2/design-system';

import { isDevActorMode, readAdminSession } from '../auth/session.js';
import { GuildProvider, useGuildContext } from './GuildContext.js';

const PULPIT = { to: '/', label: 'Pulpit' } as const;

const CENTRUM_NAV: readonly { readonly to: string; readonly label: string }[] = [
  { to: '/activity', label: 'Przegląd' },
  { to: '/activity/channels', label: 'Kanały i panel' },
  { to: '/activity/types', label: 'Typy aktywności' },
  { to: '/activity/statuses', label: 'Statusy zapisów' },
  { to: '/activity/fields', label: 'Formularz uczestnika' },
  { to: '/activity/pings', label: 'Role i pingi' },
  { to: '/activity/limits', label: 'Limity' },
  { to: '/activity/notifications', label: 'Powiadomienia' },
  { to: '/activity/reports', label: 'Zgłoszenia' },
  { to: '/activity/report-reasons', label: 'Powody zgłoszeń' },
  { to: '/activity/events', label: 'Wydarzenia' },
];

const ADVANCED_NAV: readonly { readonly to: string; readonly label: string }[] = [
  { to: '/activity/projections', label: 'Projekcje' },
  { to: '/activity/audit', label: 'Audyt' },
  { to: '/activity/hub', label: 'Diagnostyka' },
];

function GuildSelector() {
  const { guildId, guilds, setGuildId, loadingGuilds } = useGuildContext();

  if (loadingGuilds) {
    return <div className="guild-selector muted">Wczytywanie serwerów…</div>;
  }

  if (guilds.length === 0) {
    return (
      <div className="guild-selector muted">
        Brak serwerów do konfiguracji. Połącz bota Discord albo ustaw listę deweloperską.
      </div>
    );
  }

  return (
    <div className="guild-selector">
      <label htmlFor="guild-select">Serwer</label>
      <select
        id="guild-select"
        className="v2-select"
        value={guildId ?? ''}
        onChange={(event) => {
          setGuildId(event.target.value);
        }}
      >
        {guilds.map((guild) => (
          <option key={guild.id} value={guild.id}>
            {guild.name}
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
  const [navOpen, setNavOpen] = useState(false);
  const onActivity = location.pathname.startsWith('/activity');

  return (
    <div className="admin-shell">
      {isDevActorMode(session) ? (
        <div className="dev-banner" role="status">
          Tryb deweloperski — aktor Discord ustawiony lokalnie. Produkcja używa sesji Identity.
        </div>
      ) : null}

      <Button
        className="nav-toggle"
        variant="secondary"
        aria-expanded={navOpen}
        aria-controls="admin-nav-links"
        onClick={() => {
          setNavOpen((open) => !open);
        }}
      >
        {navOpen ? 'Zamknij menu' : 'Menu'}
      </Button>

      <div className="admin-shell-body">
        <aside className={navOpen ? 'admin-nav' : 'admin-nav collapsed'}>
          <div className="nav-brand">V2 Control Center</div>
          <nav id="admin-nav-links" className="nav-links" aria-label="V2 Control Center">
            <NavLink
              to={PULPIT.to}
              end
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              aria-current={location.pathname === '/' ? 'page' : undefined}
            >
              {PULPIT.label}
            </NavLink>
            <div className="nav-section">Centrum Aktywności</div>
            {CENTRUM_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/activity'}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="nav-section">Zaawansowane</div>
            {ADVANCED_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="admin-main">
          <GuildSelector />
          <div key={onActivity ? (guildId ?? 'no-guild') : 'pulpit'} className="admin-outlet">
            <Outlet />
          </div>
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
