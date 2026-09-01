'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const PROFILE_TABS = [
  { href: '/profil', label: 'Przegląd', exact: true },
  { href: '/profil/postacie', label: 'Postacie', exact: false },
  { href: '/profil/aktywnosci', label: 'Aktywności', exact: false },
  { href: '/profil/powiadomienia', label: 'Powiadomienia', exact: false },
] as const;

export function ProfileLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <header className="page-hero">
        <h1>Mój profil</h1>
        <p>Twoje konto gracza, postacie i aktywność w V2.</p>
      </header>

      <nav className="profile-subnav" aria-label="Sekcje profilu">
        {PROFILE_TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? 'profile-subnav-link is-active' : 'profile-subnav-link'}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </>
  );
}
