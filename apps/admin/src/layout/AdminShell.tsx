import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { Button } from '@v2/design-system';

import { buildAdminDiscordLoginUrl, shouldOfferIdentityLogin } from '../auth/login.js';
import { isDevActorMode, readAdminSession } from '../auth/session.js';
import { Flash } from '../components/ui.js';
import { GuildProvider, useGuildContext } from './GuildContext.js';

const PULPIT = { to: '/', label: 'Pulpit' } as const;

const CENTRUM_NAV: readonly { readonly to: string; readonly label: string }[] = [
  { to: '/activity', label: 'Przegląd' },
  { to: '/activity/channels', label: 'Kanały i panel' },
  { to: '/activity/hub-modules', label: 'Moduły Hub' },
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

function IdentityLoginActions() {
  const loginUrl = buildAdminDiscordLoginUrl(window.location.origin);
  return (
    <div className="guild-selector-actions">
      <a className="v2-btn v2-btn-primary" href={loginUrl}>
        Zaloguj przez Discord
      </a>
    </div>
  );
}

function GuildSelector() {
  const session = readAdminSession();
  const { guildId, guilds, setGuildId, guildLoadState, reloadGuilds } = useGuildContext();
  const offerLogin = shouldOfferIdentityLogin(session.mode);

  if (guildLoadState.kind === 'loading' && guilds.length === 0) {
    return <div className="guild-selector muted">Wczytywanie serwerów…</div>;
  }

  if (guildLoadState.kind === 'error' && guilds.length === 0) {
    return (
      <div className="guild-selector">
        <Flash tone="error" detail={guildLoadState.detail}>
          {guildLoadState.message}
        </Flash>
        {offerLogin ? <IdentityLoginActions /> : null}
        <Button onClick={() => reloadGuilds()}>Spróbuj ponownie</Button>
      </div>
    );
  }

  if (guildLoadState.kind === 'empty') {
    return (
      <div className="guild-selector muted">
        {offerLogin ? (
          <>
            <p>Zaloguj się, aby zobaczyć serwery, którymi możesz zarządzać.</p>
            <IdentityLoginActions />
          </>
        ) : (
          'Brak serwerów, którymi możesz zarządzać.'
        )}
      </div>
    );
  }

  return (
    <div className="guild-selector">
      {guildLoadState.kind === 'error' ? (
        <>
          <Flash tone="error" detail={guildLoadState.detail}>
            {guildLoadState.message}
          </Flash>
          {offerLogin ? <IdentityLoginActions /> : null}
          <Button onClick={() => reloadGuilds()}>Spróbuj ponownie</Button>
        </>
      ) : null}
      {guildLoadState.kind === 'loading' ? <p className="muted">Wczytywanie serwerów…</p> : null}
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
  const { guildId, devFallbackActive } = useGuildContext();
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
      {devFallbackActive ? (
        <div className="dev-banner dev-banner-warning" role="alert">
          DEV_FALLBACK_ONLY — lokalna lista serwerów. Backend Centrum Aktywności jest niedostępny;
          to nie jest dowód połączenia z Discordem ani activity-service.
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
