/**
 * Technik nav — operable IA (Centrum Aktywności deferred).
 * Live: overview/D-060, guilds, characterTimers, kingdomWar, diagnostics, panel-test if cap, Owner note.
 */

export type TechnikNavId =
  | 'overview'
  | 'discordy'
  | 'timers'
  | 'wojna'
  | 'panele'
  | 'diagnostyka'
  | 'audit'
  | 'owner';

export type TechnikNavItem = {
  readonly href: string;
  readonly label: string;
  readonly id: TechnikNavId;
};

export type TechnikNavGroup = {
  readonly title: string;
  readonly items: readonly TechnikNavItem[];
};

export const TECHNIK_NAV_GROUPS: readonly TechnikNavGroup[] = [
  {
    title: 'Start',
    items: [
      { href: '/technik', label: 'Przegląd / rewizja', id: 'overview' },
      { href: '/technik/discordy', label: 'Discordy / guildie', id: 'discordy' },
    ],
  },
  {
    title: 'Co bot wysyła graczom',
    items: [
      { href: '/technik/timery', label: 'Timery postaci (PW)', id: 'timers' },
      { href: '/technik/wojna', label: 'Wojna Królestw (PW)', id: 'wojna' },
      { href: '/technik/panele', label: 'Panele lab Discord', id: 'panele' },
    ],
  },
  {
    title: 'Ops',
    items: [
      { href: '/technik/diagnostyka', label: 'Diagnostyka', id: 'diagnostyka' },
      { href: '/technik/audit', label: 'Audyt i rollback', id: 'audit' },
      { href: '/technik/owner', label: 'Poza zakresem (Owner)', id: 'owner' },
    ],
  },
];
