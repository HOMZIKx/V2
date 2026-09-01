import {
  DEFAULT_CLASS_SPEC_CATALOG,
  DEFAULT_PARTY_ROLE_CATALOG,
  isPartyRoleKey,
  type PartyRoleKey,
} from '@v2/hub-core';

import type { GameAccountView } from './game-account.js';

export type PlayerCharacterView = {
  readonly id: string;
  readonly nickname: string;
  readonly classSpecKey: string;
  readonly classSpecLabel: string;
  readonly level: number | null;
  readonly isDefault: boolean;
  readonly gameAccountId: string | null;
  readonly partyRoles: readonly PartyRoleKey[];
};

export type PlayerProfileView = {
  readonly userId: string;
  readonly displayName: string | null;
  readonly activeCharacterId: string | null;
  readonly gameAccounts: readonly GameAccountView[];
  readonly characters: readonly PlayerCharacterView[];
  readonly interestKeys: readonly string[];
};

export type InterestCatalogView = {
  readonly key: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
};

export function resolveClassSpecLabel(classSpecKey: string): string {
  const found = DEFAULT_CLASS_SPEC_CATALOG.find((entry) => entry.key === classSpecKey);
  return found?.label ?? classSpecKey;
}

export function assertValidClassSpecKey(classSpecKey: string): void {
  const found = DEFAULT_CLASS_SPEC_CATALOG.find(
    (entry) => entry.key === classSpecKey && entry.enabled,
  );
  if (found === undefined) {
    throw new Error(`Unknown or disabled class/spec: ${classSpecKey}`);
  }
}

export function assertValidPartyRoles(roles: readonly string[]): readonly PartyRoleKey[] {
  const unique = [...new Set(roles)];
  for (const role of unique) {
    if (!isPartyRoleKey(role)) {
      throw new Error(`Unknown party role: ${role}`);
    }
    const catalog = DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === role);
    if (catalog === undefined || !catalog.enabled) {
      throw new Error(`Disabled party role: ${role}`);
    }
  }
  return unique as PartyRoleKey[];
}

/** Invariant reminder: class/spec must never imply a fixed party role. */
export function classSpecDoesNotImplyPartyRole(): true {
  return true;
}
