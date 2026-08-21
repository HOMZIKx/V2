/**
 * V2 Hub module registry — shared IA map (Owner Accepted Hub Core).
 * Adapters render from this registry; they must not invent parallel navigation trees.
 */

export const HUB_MODULE_GROUPS = ['GRA', 'RYNEK', 'GILDIA', 'TY'] as const;
export type HubModuleGroup = (typeof HUB_MODULE_GROUPS)[number];

export const HUB_MODULE_KEYS = [
  'activities',
  'reservations',
  'marketplace',
  'support',
  'community',
  'profile',
  'for_me',
  'mine',
  'notifications',
] as const;
export type HubModuleKey = (typeof HUB_MODULE_KEYS)[number];

export const HUB_MODULE_AVAILABILITIES = [
  'available',
  'foundation',
  'roadmap',
  'disabled',
] as const;
export type HubModuleAvailability = (typeof HUB_MODULE_AVAILABILITIES)[number];

export type HubWwwEntry = {
  readonly path: string;
};

export type HubDiscordEntry = {
  /** Value used in Hub StringSelect / custom-id routing. */
  readonly selectValue: HubModuleKey;
};

export type HubModuleDefinition = {
  readonly key: HubModuleKey;
  readonly group: HubModuleGroup;
  readonly label: string;
  readonly description: string;
  readonly availability: HubModuleAvailability;
  readonly discord: HubDiscordEntry;
  readonly www: HubWwwEntry | null;
  /**
   * Permission IDs that may hide the entry for UX.
   * Empty = visible to members; backend still re-authorizes operations.
   */
  readonly navigationPermissionIds: readonly string[];
};

export const DEFAULT_HUB_MODULES: readonly HubModuleDefinition[] = [
  {
    key: 'activities',
    group: 'GRA',
    label: 'Aktywności',
    description: 'Organizuj wydarzenia i zbieraj ekipę.',
    availability: 'available',
    discord: { selectValue: 'activities' },
    www: { path: '/aktywnosci' },
    navigationPermissionIds: [],
  },
  {
    key: 'reservations',
    group: 'GRA',
    label: 'Rezerwacje',
    description: 'Rezerwacje struktur i terminów.',
    availability: 'foundation',
    discord: { selectValue: 'reservations' },
    www: { path: '/rezerwacje' },
    navigationPermissionIds: [],
  },
  {
    key: 'marketplace',
    group: 'RYNEK',
    label: 'Handel',
    description: 'Oferty i obserwowane przedmioty.',
    availability: 'foundation',
    discord: { selectValue: 'marketplace' },
    www: { path: '/handel' },
    navigationPermissionIds: [],
  },
  {
    key: 'support',
    group: 'GILDIA',
    label: 'Wsparcie',
    description: 'Pomoc i zgłoszenia gildii.',
    availability: 'roadmap',
    discord: { selectValue: 'support' },
    www: { path: '/wsparcie' },
    navigationPermissionIds: [],
  },
  {
    key: 'community',
    group: 'GILDIA',
    label: 'Społeczność',
    description: 'Struktury społecznościowe V2.',
    availability: 'roadmap',
    discord: { selectValue: 'community' },
    www: { path: '/spolecznosc' },
    navigationPermissionIds: [],
  },
  {
    key: 'profile',
    group: 'TY',
    label: 'Mój profil',
    description: 'Postacie, klasa/spec, role party i zainteresowania.',
    availability: 'foundation',
    discord: { selectValue: 'profile' },
    www: { path: '/profil' },
    navigationPermissionIds: [],
  },
  {
    key: 'for_me',
    group: 'TY',
    label: 'Dla mnie',
    description: 'Trafione działania z powodem dopasowania.',
    availability: 'foundation',
    discord: { selectValue: 'for_me' },
    www: { path: '/dla-mnie' },
    navigationPermissionIds: [],
  },
  {
    key: 'mine',
    group: 'TY',
    label: 'Moje',
    description: 'Twoje aktywności, grupy, rezerwacje i oferty.',
    availability: 'foundation',
    discord: { selectValue: 'mine' },
    www: { path: '/moje' },
    navigationPermissionIds: [],
  },
  {
    key: 'notifications',
    group: 'TY',
    label: 'Powiadomienia',
    description: 'Wejście do skrzynki (pełny system w etapie 4).',
    availability: 'foundation',
    discord: { selectValue: 'notifications' },
    www: { path: '/powiadomienia' },
    navigationPermissionIds: [],
  },
] as const;

export const HUB_GROUP_LABELS: Record<HubModuleGroup, string> = {
  GRA: 'GRA',
  RYNEK: 'RYNEK',
  GILDIA: 'GILDIA',
  TY: 'TY',
};

export function isHubModuleKey(value: string): value is HubModuleKey {
  return (HUB_MODULE_KEYS as readonly string[]).includes(value);
}

export function getHubModule(key: HubModuleKey): HubModuleDefinition {
  const found = DEFAULT_HUB_MODULES.find((module) => module.key === key);
  if (found === undefined) {
    throw new Error(`Unknown hub module: ${key}`);
  }
  return found;
}

export function listHubModulesForSelect(
  modules: readonly HubModuleDefinition[] = DEFAULT_HUB_MODULES,
): readonly HubModuleDefinition[] {
  return modules.filter((module) => module.availability !== 'disabled');
}

export function isHubModuleInteractive(availability: HubModuleAvailability): boolean {
  return availability === 'available' || availability === 'foundation';
}
