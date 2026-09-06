'use client';

import type { ReactNode } from 'react';

const TABS = [
  { href: '/technik', label: 'Status', id: 'status' as const },
  { href: '/technik/bot', label: 'Konfiguracja bota', id: 'bot' as const },
  { href: '/technik/diagnostics', label: 'Diagnostyka', id: 'diagnostics' as const },
] as const;

export function TechnikShell({
  active,
  children,
}: {
  readonly active: 'status' | 'bot' | 'diagnostics';
  readonly children: ReactNode;
}) {
  return (
    <div className="technik-layout">
      <aside className="technik-sidebar" aria-label="Nawigacja Technika">
        <div className="technik-brand">
          <strong>DESTILED · Technik</strong>
          <span>Panel Technika (bot) — pełna bramka ról P3 później</span>
        </div>
        <nav className="technik-subnav">
          {TABS.map((tab) => {
            const current = tab.id === active;
            return (
              <a
                key={tab.href}
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={current ? 'is-active' : undefined}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>
      </aside>
      <div className="technik-main">{children}</div>
    </div>
  );
}