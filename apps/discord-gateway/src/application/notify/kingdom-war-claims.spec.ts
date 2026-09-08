import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimKingdomWarCharacter,
  countClaimsForUser,
  encodeKingdomWarScopedCharacterId,
  getKingdomWarClaims,
  resetKingdomWarClaimsForTests,
} from './kingdom-war-claims.js';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

function scoped(workspaceId: string, characterId: string): string {
  return encodeKingdomWarScopedCharacterId(workspaceId, characterId);
}

describe('claimKingdomWarCharacter team isolation', () => {
  beforeEach(() => {
    resetKingdomWarClaimsForTests();
  });

  it('allows up to 3 claims by default inside one team', () => {
    const user = '808066932753563668';
    expect(claimKingdomWarCharacter({ characterId: scoped(TEAM_A, 'a'), discordUserId: user }).ok).toBe(true);
    expect(claimKingdomWarCharacter({ characterId: scoped(TEAM_A, 'b'), discordUserId: user }).ok).toBe(true);
    expect(claimKingdomWarCharacter({ characterId: scoped(TEAM_A, 'c'), discordUserId: user }).ok).toBe(true);
    const fourth = claimKingdomWarCharacter({
      characterId: scoped(TEAM_A, 'd'),
      discordUserId: user,
    });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe('max_claims');
    expect(countClaimsForUser(user, TEAM_A)).toBe(3);
  });

  it('applies claim limits independently in different teams', () => {
    const user = '111111111111111111';
    expect(
      claimKingdomWarCharacter({
        characterId: scoped(TEAM_A, 'a'),
        discordUserId: user,
        maxClaimsPerUser: 1,
      }).ok,
    ).toBe(true);
    const secondA = claimKingdomWarCharacter({
      characterId: scoped(TEAM_A, 'b'),
      discordUserId: user,
      maxClaimsPerUser: 1,
    });
    expect(secondA.ok).toBe(false);
    if (!secondA.ok) expect(secondA.reason).toBe('max_claims');

    expect(
      claimKingdomWarCharacter({
        characterId: scoped(TEAM_B, 'a'),
        discordUserId: user,
        maxClaimsPerUser: 1,
      }).ok,
    ).toBe(true);
    expect(countClaimsForUser(user, TEAM_A)).toBe(1);
    expect(countClaimsForUser(user, TEAM_B)).toBe(1);
  });

  it('keeps the same character ids independent across teams', () => {
    const a = '111111111111111111';
    const b = '222222222222222222';
    expect(claimKingdomWarCharacter({ characterId: scoped(TEAM_A, 'main'), discordUserId: a }).ok).toBe(true);
    expect(claimKingdomWarCharacter({ characterId: scoped(TEAM_B, 'main'), discordUserId: b }).ok).toBe(true);

    const claimsA = getKingdomWarClaims(TEAM_A);
    const claimsB = getKingdomWarClaims(TEAM_B);
    expect(Object.values(claimsA)).toEqual([a]);
    expect(Object.values(claimsB)).toEqual([b]);
  });

  it('rejects legacy unscoped war buttons instead of assigning them globally', () => {
    const result = claimKingdomWarCharacter({
      characterId: 'legacy-character',
      discordUserId: '111111111111111111',
    });
    expect(result.ok).toBe(false);
  });
});
