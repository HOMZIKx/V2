/**
 * Character class/spec catalog — NOT party roles.
 * Configurable; do not hardcode only inside Discord/WWW renderers.
 */

export type ClassSpecCatalogEntry = {
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
};

/** Default Metin2-oriented seed — Admin may enable/disable entries. */
export const DEFAULT_CLASS_SPEC_CATALOG: readonly ClassSpecCatalogEntry[] = [
  { key: 'warrior_body', label: 'Wojownik Body', enabled: true, sortOrder: 10 },
  { key: 'warrior_mental', label: 'Wojownik Mental', enabled: true, sortOrder: 20 },
  { key: 'ninja_blade', label: 'Ninja Ostrze', enabled: true, sortOrder: 30 },
  { key: 'ninja_dagger', label: 'Ninja Sztylet', enabled: true, sortOrder: 40 },
  { key: 'sura_weapon', label: 'Sura Broń', enabled: true, sortOrder: 50 },
  { key: 'sura_magic', label: 'Sura Magia', enabled: true, sortOrder: 60 },
  { key: 'shaman_dragon', label: 'Szaman Smok', enabled: true, sortOrder: 70 },
  { key: 'shaman_heal', label: 'Szaman Uzdrawianie', enabled: true, sortOrder: 80 },
  { key: 'lycan', label: 'Lycan', enabled: true, sortOrder: 90 },
] as const;

export function listEnabledClassSpecs(
  catalog: readonly ClassSpecCatalogEntry[] = DEFAULT_CLASS_SPEC_CATALOG,
): readonly ClassSpecCatalogEntry[] {
  return catalog.filter((entry) => entry.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}
