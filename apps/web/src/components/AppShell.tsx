'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Button, Select } from '@v2/design-system';

import { useGuild } from './GuildProvider';
import { useSession } from './SessionProvider';

const NAV: readonly { href: string; label: string }[] = [
  { href: '/aktywnosci', label: 'Aktywności' },
  { href: '/dla-mnie', label: 'Dla mnie' },
  { href: '/moje', label: 'Moje' },
  { href: '/profil', label: 'Profil' },
  { href: '/powiadomienia', label: 'Powiadomienia' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, logout } = useSession();
  const { guilds, guildId, setGuildId } = useGuild();
  const currentGuild = guilds.find((guild) => guild.id === guildId) ?? guilds[0];
  const displayName = session?.displayName?.trim() || 'Konto';

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
            <Select
              id="guild-switcher"
              aria-label="Serwer"
              value={guildId ?? ''}
              options={guilds.map((guild) => ({ value: guild.id, label: guild.name }))}
              onChange={(event) => {
                setGuildId(event.target.value);
              }}
            />
          ) : currentGuild !== undefined ? (
            <p className="guild-current" aria-label="Aktualny serwer">
              {currentGuild.name}
            </p>
          ) : null}
          {session !== null ? (
            <div className="user-menu">
              {session.avatarUrl !== undefined &&
              session.avatarUrl !== null &&
              session.avatarUrl !== '' ? (
                <img src={session.avatarUrl} alt="" className="user-avatar" />
              ) : null}
              <span className="user-name">{displayName}</span>
            </div>
          ) : null}
          <Button variant="ghost" onClick={() => void logout()}>
            Wyloguj
          </Button>
        </div>
      </header>
      <main className="web-main">{children}</main>
    </div>
  );
}
