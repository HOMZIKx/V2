import type {
  GameAccountDto,
  IdentityProfileCharacterDto,
  IdentityProfileDto,
} from '../../lib/lfg-api';

export function resolveActiveCharacter(
  profile: IdentityProfileDto,
): IdentityProfileCharacterDto | null {
  if (profile.characters.length === 0) {
    return null;
  }
  if (profile.activeCharacterId !== undefined && profile.activeCharacterId !== null) {
    const active = profile.characters.find((entry) => entry.id === profile.activeCharacterId);
    if (active !== undefined) {
      return active;
    }
  }
  return (
    profile.characters.find((entry) => entry.isDefault === true) ?? profile.characters[0] ?? null
  );
}

export function groupCharactersByAccount(profile: IdentityProfileDto): readonly {
  account: GameAccountDto | null;
  characters: readonly IdentityProfileCharacterDto[];
}[] {
  const accounts = profile.gameAccounts ?? [];
  const byAccount = new Map<string, IdentityProfileCharacterDto[]>();
  const orphans: IdentityProfileCharacterDto[] = [];

  for (const character of profile.characters) {
    const accountId = character.gameAccountId;
    if (accountId === undefined || accountId === null) {
      orphans.push(character);
      continue;
    }
    const list = byAccount.get(accountId) ?? [];
    list.push(character);
    byAccount.set(accountId, list);
  }

  const groups: {
    account: GameAccountDto | null;
    characters: readonly IdentityProfileCharacterDto[];
  }[] = accounts.map((account) => ({
    account,
    characters: byAccount.get(account.id) ?? [],
  }));

  if (orphans.length > 0) {
    groups.push({ account: null, characters: orphans });
  }

  return groups;
}
