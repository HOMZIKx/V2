export type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly end?: boolean;
};

export type NavSection = {
  readonly title: string;
  readonly items: readonly NavItem[];
};

export const PULPIT_NAV: NavItem = { to: '/', label: 'Pulpit', end: true };

export const ADMIN_NAV_SECTIONS: readonly NavSection[] = [
  {
    title: 'Discord Bot',
    items: [
      { to: '/discord/centrum', label: 'Centrum V2' },
      { to: '/discord/notifications', label: 'Powiadomienia' },
    ],
  },
  {
    title: 'Aktywności',
    items: [
      { to: '/activities/overview', label: 'Przegląd', end: true },
      { to: '/activities/events', label: 'Wydarzenia' },
      { to: '/activities/types', label: 'Typy aktywności' },
      { to: '/activities/lfg', label: 'LFG' },
      { to: '/activities/settings/statuses', label: 'Ustawienia' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/system/projections', label: 'Projekcje' },
      { to: '/system/audit', label: 'Audyt' },
      { to: '/system/diagnostics', label: 'Diagnostyka' },
    ],
  },
] as const;

export const ACTIVITY_SETTINGS_TABS: readonly NavItem[] = [
  { to: '/activities/settings/statuses', label: 'Zapisy' },
  { to: '/activities/settings/fields', label: 'Formularz uczestnika' },
  { to: '/activities/settings/pings', label: 'Role' },
  { to: '/activities/settings/limits', label: 'Limity' },
  { to: '/activities/settings/notifications', label: 'Powiadomienia' },
  { to: '/activities/settings/reports', label: 'Moderacja' },
  { to: '/activities/settings/report-reasons', label: 'Powody zgłoszeń' },
] as const;

/** Legacy `/activity/*` paths kept for bookmarks and E2E — redirect in App.tsx */
export const LEGACY_ACTIVITY_REDIRECTS: readonly { readonly from: string; readonly to: string }[] =
  [
    { from: '/activity', to: '/activities/overview' },
    { from: '/activity/channels', to: '/discord/centrum' },
    { from: '/activity/hub-modules', to: '/discord/centrum' },
    { from: '/activity/hub', to: '/system/diagnostics' },
    { from: '/activity/types', to: '/activities/types' },
    { from: '/activity/lfg-composition', to: '/activities/lfg' },
    { from: '/activity/statuses', to: '/activities/settings/statuses' },
    { from: '/activity/fields', to: '/activities/settings/fields' },
    { from: '/activity/pings', to: '/activities/settings/pings' },
    { from: '/activity/limits', to: '/activities/settings/limits' },
    { from: '/activity/notifications', to: '/discord/notifications' },
    { from: '/activity/report-reasons', to: '/activities/settings/report-reasons' },
    { from: '/activity/reports', to: '/activities/settings/reports' },
    { from: '/activity/events', to: '/activities/events' },
    { from: '/activity/projections', to: '/system/projections' },
    { from: '/activity/audit', to: '/system/audit' },
  ] as const;
