import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

const NAV = [
  { to: '/', label: 'Status', end: true },
  { to: '/bot', label: 'Konfiguracja bota', end: false },
  { to: '/diagnostics', label: 'Diagnostyka', end: false },
] as const;

export function AdminShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <strong>DESTILED · Admin</strong>
          <span>Panel Technika (bot)</span>
        </div>
        <nav className="admin-nav" aria-label="Nawigacja Technika">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
