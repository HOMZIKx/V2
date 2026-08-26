/**
 * V2 Hub module registry — shared IA map (Owner Accepted Hub Core).
 * Adapters render from this registry; they must not invent parallel navigation trees.
 *
 * Discord Centrum (Owner UX correction): only interactive player actions appear in the
 * public select. Roadmap modules are never clickable placeholders.
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

/** Discord Centrum select values — direct actions (no Aktywności submenu). */
export const HUB_CENTRUM_ACTION_KEYS = [
  'create',
  'lfg',
  'mine',
  'for_me',
  'profile',
  'notifications',
] as const;
export type HubCentrumActionKey = (typeof HUB_CENTRUM_ACTION_KEYS)[number];

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

export type HubCentrumSelectOption = {
  readonly value: HubCentrumActionKey;
  readonly label: string;
  readonly description: string;
  readonly section: 'GRA' | 'DLA_CIEBIE';
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
    availability: 'roadmap',
    discord: { selectValue: 'reservations' },
    www: { path: '/rezerwacje' },
    navigationPermissionIds: [],
  },
  {
    key: 'marketplace',
    group: 'RYNEK',
    label: 'Handel',
    description: 'Oferty i obserwowane przedmioty.',
    availability: 'roadmap',
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
    description: 'Postacie, zainteresowania i ustawienia.',
    availability: 'available',
    discord: { selectValue: 'profile' },
    www: { path: '/profil' },
    navigationPermissionIds: [],
  },
  {
    key: 'for_me',
    group: 'TY',
    label: 'Dla mnie',
    description: 'Rzeczy, które mogą Cię zainteresować.',
    availability: 'available',
    discord: { selectValue: 'for_me' },
    www: { path: '/dla-mnie' },
    navigationPermissionIds: [],
  },
  {
    key: 'mine',
    group: 'TY',
    label: 'Moje aktywności',
    description: 'Twoje aktywności i grupy.',
    availability: 'available',
    discord: { selectValue: 'mine' },
    www: { path: '/moje' },
    navigationPermissionIds: [],
  },
  {
    key: 'notifications',
    group: 'TY',
    label: 'Powiadomienia',
    description: 'Skrzynka i preferencje powiadomień.',
    availability: 'available',
    discord: { selectValue: 'notifications' },
    www: { path: '/powiadomienia' },
    navigationPermissionIds: [],
  },
] as const;

/** Direct Centrum actions — replaces module-dropdown + Aktywności submenu. */
export const HUB_CENTRUM_SELECT_OPTIONS: readonly HubCentrumSelectOption[] = [
  {
    value: 'create',
    label: 'Utwórz aktywność',
    description: 'Nowa aktywność w Discordzie',
    section: 'GRA',
  },
  {
    value: 'lfg',
    label: 'Szukam ekipy',
    description: 'Dopasuj ekipę do postaci i czasu',
    section: 'GRA',
  },
  {
    value: 'mine',
    label: 'Moje aktywności',
    description: 'Organizuję i jestem zapisany',
    section: 'GRA',
  },
  {
    value: 'for_me',
    label: 'Dla mnie',
    description: 'Propozycje dopasowane do Ciebie',
    section: 'DLA_CIEBIE',
  },
  {
    value: 'profile',
    label: 'Mój profil',
    description: 'Postacie i zainteresowania',
    section: 'DLA_CIEBIE',
  },
  {
    value: 'notifications',
    label: 'Powiadomienia',
    description: 'Skrzynka i wyciszenia',
    section: 'DLA_CIEBIE',
  },
] as const;

export const HUB_GROUP_LABELS: Record<HubModuleGroup, string> = {
  GRA: 'GRA',
  RYNEK: 'RYNEK',
  GILDIA: 'GILDIA',
  TY: 'TY',
};

export const HUB_CENTRUM_SECTION_LABELS = {
  GRA: 'GRA',
  DLA_CIEBIE: 'DLA CIEBIE',
} as const;

export function isHubModuleKey(value: string): value is HubModuleKey {
  return (HUB_MODULE_KEYS as readonly string[]).includes(value);
}

export function isHubCentrumActionKey(value: string): value is HubCentrumActionKey {
  return (HUB_CENTRUM_ACTION_KEYS as readonly string[]).includes(value);
}

export function getHubModule(key: HubModuleKey): HubModuleDefinition {
  const found = DEFAULT_HUB_MODULES.find((module) => module.key === key);
  if (found === undefined) {
    throw new Error(`Unknown hub module: ${key}`);
  }
  return found;
}

/** @deprecated Prefer listHubCentrumSelectOptions for Discord Centrum. */
export function listHubModulesForSelect(
  modules: readonly HubModuleDefinition[] = DEFAULT_HUB_MODULES,
): readonly HubModuleDefinition[] {
  return modules.filter(
    (module) => module.availability === 'available' || module.availability === 'foundation',
  );
}

export function listHubCentrumSelectOptions(
  options: readonly HubCentrumSelectOption[] = HUB_CENTRUM_SELECT_OPTIONS,
): readonly HubCentrumSelectOption[] {
  return options;
}

export function listRoadmapModuleLabels(
  modules: readonly HubModuleDefinition[] = DEFAULT_HUB_MODULES,
): readonly string[] {
  return modules
    .filter((module) => module.availability === 'roadmap')
    .map((module) => module.label);
}

export function isHubModuleInteractive(availability: HubModuleAvailability): boolean {
  return availability === 'available' || availability === 'foundation';
}
