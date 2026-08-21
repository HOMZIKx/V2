import { describe, expect, it } from 'vitest';

import { isLfgIntentActive, rankLfgMatch } from './lfg-matching.js';

const baseGroup = {
  activityTypeKey: 'azrael',
  guildId: 'g1',
  organizationId: 'o1',
  capacity: 8,
  occupied: 5,
  status: 'open' as const,
  startAtMs: 1_700_000_000_000,
  roleNeeds: [
    { role: 'TANK' as const, requiredCount: 1 },
    { role: 'BUFF' as const, requiredCount: 1 },
    { role: 'DPS' as const, requiredCount: 4 },
  ],
  filledByRole: { TANK: 1, BUFF: 0, DPS: 4 },
};

const baseSeeker = {
  guildId: 'g1',
  organizationId: 'o1',
  activityTypeKey: 'azrael',
  characterClassSpecKey: 'warrior_body',
  characterSupportedRoles: ['DPS', 'TANK'] as const,
  sessionRoles: ['DPS'] as const,
  windowStartMs: 1_699_000_000_000,
  windowEndMs: 1_701_000_000_000,
  membershipOk: true,
};

describe('lfg matching', () => {
  it('ranks exact role need', () => {
    const result = rankLfgMatch(baseGroup, {
      ...baseSeeker,
      sessionRoles: ['BUFF'],
      characterSupportedRoles: ['BUFF', 'DPS'],
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain('exact_role');
  });

  it('allows multi-role character with session subset', () => {
    const asDps = rankLfgMatch(
      { ...baseGroup, filledByRole: { TANK: 1, BUFF: 1, DPS: 2 } },
      baseSeeker,
    );
    expect(asDps.eligible).toBe(true);
  });

  it('rejects time / guild / membership mismatches and full groups', () => {
    expect(
      rankLfgMatch(baseGroup, { ...baseSeeker, windowEndMs: 1_600_000_000_000 }).eligible,
    ).toBe(false);
    expect(rankLfgMatch(baseGroup, { ...baseSeeker, guildId: 'other' }).eligible).toBe(false);
    expect(rankLfgMatch(baseGroup, { ...baseSeeker, membershipOk: false }).eligible).toBe(false);
    expect(rankLfgMatch({ ...baseGroup, occupied: 8, status: 'full' }, baseSeeker).eligible).toBe(
      false,
    );
  });

  it('expires intents by TTL and cancellation', () => {
    const intent = {
      userDiscordId: 'u',
      characterId: 'c',
      activityTypeKey: 'azrael',
      sessionRoles: ['DPS'] as const,
      windowStartMs: 0,
      windowEndMs: 10,
      expiresAtMs: 100,
      cancelledAtMs: null,
      guildId: 'g1',
      organizationId: 'o1',
    };
    expect(isLfgIntentActive(intent, 50)).toBe(true);
    expect(isLfgIntentActive(intent, 150)).toBe(false);
    expect(isLfgIntentActive({ ...intent, cancelledAtMs: 40 }, 50)).toBe(false);
  });
});
