/**
 * Technik nav — intentional IA (quality over speed).
 * Publish: Wygląd → Centrum → Kanały → Cykliczne → Panele lab (test).
 */

export type TechnikNavId =
  | 'overview'
  | 'discordy'
  | 'wyglad'
  | 'centrum'
  | 'kanaly'
  | 'cykliczne'
  | 'panele'
  | 'timers'
  | 'wojna'
  | 'aktywnosc'
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
      { href: '/technik', label: 'Przegląd', id: 'overview' },
      { href: '/technik/discordy', label: 'Discordy', id: 'discordy' },
    ],
  },
  {
    title: 'Publikacja Discord',
    items: [
      { href: '/technik/wyglad', label: 'Wygląd postów', id: 'wyglad' },
      { href: '/technik/centrum', label: 'Centrum panel', id: 'centrum' },
      { href: '/technik/kanaly', label: 'Kanały', id: 'kanaly' },
      { href: '/technik/cykliczne', label: 'Cykliczne', id: 'cykliczne' },
      { href: '/technik/panele', label: 'Panele lab (test)', id: 'panele' },
    ],
  },
  {
    title: 'PW do graczy',
    items: [
      { href: '/technik/timery', label: 'Timery postaci', id: 'timers' },
      { href: '/technik/wojna', label: 'Wojna Królestw', id: 'wojna' },
    ],
  },
  {
    title: 'Ops',
    items: [
      { href: '/technik/aktywnosc', label: 'Aktywność członków', id: 'aktywnosc' },
      { href: '/technik/diagnostyka', label: 'Diagnostyka', id: 'diagnostyka' },
      { href: '/technik/audit', label: 'Audyt', id: 'audit' },
      { href: '/technik/owner', label: 'Poza zakresem (Owner)', id: 'owner' },
    ],
  },
];
