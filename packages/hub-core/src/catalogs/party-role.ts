/**
 * Party capability / role catalog — separate from character class/spec.
 * A character may support multiple roles (e.g. Body: DPS + TANK).
 */

export const PARTY_ROLE_KEYS = ['TANK', 'BUFF', 'DPS', 'FLEX'] as const;
export type PartyRoleKey = (typeof PARTY_ROLE_KEYS)[number];

export type PartyRoleCatalogEntry = {
  readonly key: PartyRoleKey;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
};

export const DEFAULT_PARTY_ROLE_CATALOG: readonly PartyRoleCatalogEntry[] = [
  {
    key: 'TANK',
    label: 'Tank',
    description: 'Przyjmuje obrażenia / aggro.',
    enabled: true,
    sortOrder: 10,
  },
  {
    key: 'BUFF',
    label: 'Buff',
    description: 'Wsparcie buffami / utility.',
    enabled: true,
    sortOrder: 20,
  },
  {
    key: 'DPS',
    label: 'DPS',
    description: 'Obrażenia.',
    enabled: true,
    sortOrder: 30,
  },
  {
    key: 'FLEX',
    label: 'Any / Flex',
    description: 'Elastyczna rola według potrzeb grupy.',
    enabled: true,
    sortOrder: 40,
  },
] as const;

export function isPartyRoleKey(value: string): value is PartyRoleKey {
  return (PARTY_ROLE_KEYS as readonly string[]).includes(value);
}
