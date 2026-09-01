import { NavLink, Outlet } from 'react-router';

import { PageHeader } from '../components/ui.js';
import { ACTIVITY_SETTINGS_TABS } from '../navigation.js';

export function ActivitySettingsLayout() {
  return (
    <section className="stack">
      <PageHeader
        title="Ustawienia aktywności"
        description="Zapisy, formularze, role, limity i moderacja — w jednym miejscu."
      />
      <nav className="settings-tabs" aria-label="Sekcje ustawień aktywności">
        {ACTIVITY_SETTINGS_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
