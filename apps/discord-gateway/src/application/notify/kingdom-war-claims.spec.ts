import { describe, expect, it, beforeEach } from 'vitest';

import {
  claimKingdomWarCharacter,
  countClaimsForUser,
  resetKingdomWarClaimsForTests,
} from './kingdom-war-claims.js';

describe('claimKingdomWarCharacter maxClaimsPerUser', () => {
  beforeEach(() => {
    resetKingdomWarClaimsForTests();
  });

  it('allows up to 3 claims by default', () => {
    const user = '808066932753563668';
    expect(claimKingdomWarCharacter({ characterId: 'a', discordUserId: user }).ok).toBe(true);
    expect(claimKingdomWarCharacter({ characterId: 'b', discordUserId: user }).ok).toBe(true);
    expect(claimKingdomWarCharacter({ characterId: 'c', discordUserId: user }).ok).toBe(true);
    const fourth = claimKingdomWarCharacter({ characterId: 'd', discordUserId: user });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe('max_claims');
    expect(countClaimsForUser(user)).toBe(3);
  });

  it('respects custom maxClaimsPerUser', () => {
    const user = '111111111111111111';
    expect(
      claimKingdomWarCharacter({ characterId: 'a', discordUserId: user, maxClaimsPerUser: 1 }).ok,
    ).toBe(true);
    const second = claimKingdomWarCharacter({
      characterId: 'b',
      discordUserId: user,
      maxClaimsPerUser: 1,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('max_claims');
  });
});
