'use client';

import type { ReactNode } from 'react';

import { TECHNIK_NAV_GROUPS, type TechnikNavId } from './technik-nav';

export type { TechnikNavId };

export function TechnikShell({
  active,
  children,
}: {
  readonly active: TechnikNavId;
  readonly children: ReactNode;
}) {
  return (
    <div className="technik-layout">
      <aside className="technik-sidebar" aria-label="Nawigacja Technika">
        <div className="technik-brand">
          <strong>DESTILED · Technik</strong>
          <span>
            Konfiguracja bota Discord — jeden jasny cel na zakładkę. Najpierw Testowy, potem Apply.
          </span>
        </div>
        <nav className="technik-subnav">
          {TECHNIK_NAV_GROUPS.map((group) => (
            <div key={group.title} className="technik-nav-group">
              <p className="technik-nav-group__title">{group.title}</p>
              {group.items.map((tab) => {
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
            </div>
          ))}
        </nav>
      </aside>
      <div className="technik-main">{children}</div>
    </div>
  );
}
