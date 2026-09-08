import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimKingdomWarCharacter,
  confirmKingdomWarClaimForUser,
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

function claimAndConfirm(input: {
  workspaceId: string;
  characterId: string;
  discordUserId: string;
  maxClaimsPerUser?: number;
}): boolean {
  const staged = claimKingdomWarCharacter({
    characterId: scoped(input.workspaceId, input.characterId),
    discordUserId: input.discordUserId,
    ...(input.maxClaimsPerUser !== undefined
      ? { maxClaimsPerUser: input.maxClaimsPerUser }
      : {}),
  });
  return staged.ok && confirmKingdomWarClaimForUser(input.discordUserId);
}

describe('claimKingdomWarCharacter team isolation', () => {
  beforeEach(() => {
    resetKingdomWarClaimsForTests();
  });

  it('allows up to 3 confirmed claims by default inside one team', () => {
    const user = '808066932753563668';
    expect(claimAndConfirm({ workspaceId: TEAM_A, characterId: 'a', discordUserId: user })).toBe(true);
    expect(claimAndConfirm({ workspaceId: TEAM_A, characterId: 'b', discordUserId: user })).toBe(true);
    expect(claimAndConfirm({ workspaceId: TEAM_A, characterId: 'c', discordUserId: user })).toBe(true);
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
      claimAndConfirm({
        workspaceId: TEAM_A,
        characterId: 'a',
        discordUserId: user,
        maxClaimsPerUser: 1,
      }),
    ).toBe(true);
    const secondA = claimKingdomWarCharacter({
      characterId: scoped(TEAM_A, 'b'),
      discordUserId: user,
      maxClaimsPerUser: 1,
    });
    expect(secondA.ok).toBe(false);
    if (!secondA.ok) expect(secondA.reason).toBe('max_claims');

    expect(
      claimAndConfirm({
        workspaceId: TEAM_B,
        characterId: 'a',
        discordUserId: user,
        maxClaimsPerUser: 1,
      }),
    ).toBe(true);
    expect(countClaimsForUser(user, TEAM_A)).toBe(1);
    expect(countClaimsForUser(user, TEAM_B)).toBe(1);
  });

  it('keeps the same character ids independent across teams', () => {
    const a = '111111111111111111';
    const b = '222222222222222222';
    expect(claimAndConfirm({ workspaceId: TEAM_A, characterId: 'main', discordUserId: a })).toBe(true);
    expect(claimAndConfirm({ workspaceId: TEAM_B, characterId: 'main', discordUserId: b })).toBe(true);

    const claimsA = getKingdomWarClaims(TEAM_A);
    const claimsB = getKingdomWarClaims(TEAM_B);
    expect(Object.values(claimsA)).toEqual([a]);
    expect(Object.values(claimsB)).toEqual([b]);
  });

  it('does not persist a staged claim before membership verification confirms it', () => {
    const user = '111111111111111111';
    const staged = claimKingdomWarCharacter({
      characterId: scoped(TEAM_A, 'pending'),
      discordUserId: user,
    });
    expect(staged.ok).toBe(true);
    expect(countClaimsForUser(user, TEAM_A)).toBe(0);
    expect(Object.values(getKingdomWarClaims(TEAM_A))).toEqual([]);
  });

  it('rejects legacy unscoped war buttons instead of assigning them globally', () => {
    const result = claimKingdomWarCharacter({
      characterId: 'legacy-character',
      discordUserId: '111111111111111111',
    });
    expect(result.ok).toBe(false);
  });
});
