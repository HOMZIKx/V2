/**
 * Character class/spec catalog — NOT party roles.
 * Configurable; do not hardcode only inside Discord/WWW renderers.
 *
 * Internal keys are stable. Player-facing labels are Polish product names.
 * Lycan/Likan is not newly selectable on this V2 server catalog.
 */

export type ClassSpecCatalogEntry = {
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
};

/** Default Metin2-oriented seed — Admin may enable/disable entries. */
export const DEFAULT_CLASS_SPEC_CATALOG: readonly ClassSpecCatalogEntry[] = [
  { key: 'warrior_body', label: 'Wojownik Ciało', enabled: true, sortOrder: 10 },
  { key: 'warrior_mental', label: 'Wojownik Umysł', enabled: true, sortOrder: 20 },
  { key: 'ninja_blade', label: 'Ninja Ostrze', enabled: true, sortOrder: 30 },
  { key: 'ninja_dagger', label: 'Ninja Łuk', enabled: true, sortOrder: 40 },
  { key: 'sura_weapon', label: 'Sura Broń', enabled: true, sortOrder: 50 },
  { key: 'sura_magic', label: 'Sura Czarna Magia', enabled: true, sortOrder: 60 },
  { key: 'shaman_dragon', label: 'Szaman Smok', enabled: true, sortOrder: 70 },
  { key: 'shaman_heal', label: 'Szaman Leczenie', enabled: true, sortOrder: 80 },
  /** Historical only — must not appear in new-character selectors. */
  { key: 'lycan', label: 'Lycan', enabled: false, sortOrder: 90 },
] as const;

export const PLAYER_FACING_CLASS_SPEC_LABELS = [
  'Wojownik Ciało',
  'Wojownik Umysł',
  'Ninja Ostrze',
  'Ninja Łuk',
  'Sura Broń',
  'Sura Czarna Magia',
  'Szaman Smok',
  'Szaman Leczenie',
] as const;

export const FORBIDDEN_PLAYER_CLASS_SPEC_LABELS = [
  'Lycan',
  'Likan',
  'Body',
  'Mental',
  'Dagger',
  'Archer',
  'Weapon',
  'Black Magic',
  'Wojownik Body',
  'Wojownik Mental',
  'Ninja Sztylet',
  'Sura Magia',
  'Szaman Uzdrawianie',
] as const;

export function listEnabledClassSpecs(
  catalog: readonly ClassSpecCatalogEntry[] = DEFAULT_CLASS_SPEC_CATALOG,
): readonly ClassSpecCatalogEntry[] {
  return catalog.filter((entry) => entry.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveClassSpecLabel(
  key: string,
  catalog: readonly ClassSpecCatalogEntry[] = DEFAULT_CLASS_SPEC_CATALOG,
): string {
  return catalog.find((entry) => entry.key === key)?.label ?? key;
}
