import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { Button } from '@v2/design-system';

import { getApiBaseUrl } from '../api/http.js';
import { buildAdminDiscordLoginUrl, shouldOfferIdentityLogin } from '../auth/login.js';
import { isDevActorMode, readAdminSession } from '../auth/session.js';
import { Flash } from '../components/ui.js';
import { ADMIN_NAV_SECTIONS, PULPIT_NAV } from '../navigation.js';
import { GuildProvider, useGuildContext } from './GuildContext.js';

function IdentityLoginActions() {
  const loginUrl = buildAdminDiscordLoginUrl(
    window.location.origin,
    getApiBaseUrl(),
    import.meta.env.VITE_ADMIN_PUBLIC_ORIGIN,
  );
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
  const needsGuild =
    location.pathname.startsWith('/activities') ||
    location.pathname.startsWith('/discord') ||
    location.pathname.startsWith('/system');

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
              to={PULPIT_NAV.to}
              end={PULPIT_NAV.end === true}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {PULPIT_NAV.label}
            </NavLink>
            {ADMIN_NAV_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="nav-section">{section.title}</div>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end === true}
                    className={({ isActive }) => (isActive ? 'active' : undefined)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="admin-main">
          <GuildSelector />
          <div key={needsGuild ? (guildId ?? 'no-guild') : 'pulpit'} className="admin-outlet">
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
