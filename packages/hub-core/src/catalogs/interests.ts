/**
 * Interest catalog seed keys — Issue #27 foundation.
 * Interest ≠ Discord role ≠ notification preference ≠ class/spec ≠ party role.
 */

export type InterestCatalogEntry = {
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
};

export const DEFAULT_INTEREST_CATALOG: readonly InterestCatalogEntry[] = [
  { key: 'azrael', label: 'Azrael', enabled: true, sortOrder: 10 },
  { key: 'smok', label: 'Smok', enabled: true, sortOrder: 20 },
  { key: 'wb', label: 'World Boss', enabled: true, sortOrder: 30 },
  { key: 'ox', label: 'OX', enabled: true, sortOrder: 40 },
  { key: 'pvm', label: 'PvM', enabled: true, sortOrder: 50 },
  { key: 'pvp', label: 'PvP', enabled: true, sortOrder: 60 },
] as const;
