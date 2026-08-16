'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useGuild } from './GuildProvider';
import { useSession } from './SessionProvider';

const NAV: readonly { href: string; label: string }[] = [
  { href: '/aktywnosci', label: 'Aktywności' },
  { href: '/moje', label: 'Moje' },
  { href: '/powiadomienia', label: 'Powiadomienia' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, logout } = useSession();
  const { guilds, guildId, setGuildId } = useGuild();

  return (
    <div className="web-shell">
      <header className="web-topbar">
        <Link href="/aktywnosci" className="web-brand">
          V2
        </Link>
        <nav className="web-nav" aria-label="Główne">
          {NAV.map((item) => {
            const current =
              pathname === item.href ||
              (item.href !== '/aktywnosci' && pathname.startsWith(item.href)) ||
              (item.href === '/aktywnosci' && pathname.startsWith('/aktywnosci'));
            return (
              <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="web-topbar-tools">
          {guilds.length > 1 ? (
            <div className="field" style={{ minWidth: '12rem', margin: 0 }}>
              <label htmlFor="guild-switcher">Serwer</label>
              <select
                id="guild-switcher"
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
          ) : null}
          {session !== null ? (
            <span className="user-chip" title={session.v2UserId}>
              Discord {session.discordUserId}
            </span>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            Wyloguj
          </button>
        </div>
      </header>
      <main className="web-main">{children}</main>
    </div>
  );
}
