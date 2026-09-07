import { describe, expect, it } from 'vitest';

import {
  canProbeOwnDiscordMembership,
  parseTechnikMembershipProbePath,
} from './technik-membership-route';

describe('Technik membership route policy', () => {
  const guildId = '1543972927719080016';
  const userId = '808066932753563668';

  it('parses only the exact guild member probe route', () => {
    expect(parseTechnikMembershipProbePath(`guilds/${guildId}/members/${userId}`)).toEqual({
      guildId,
      userId,
    });
    expect(parseTechnikMembershipProbePath(`guilds/${guildId}/roles`)).toBeNull();
    expect(parseTechnikMembershipProbePath(`guilds/${guildId}/members/not-a-snowflake`)).toBeNull();
  });

  it('allows a logged-in Discord user to probe only their own membership', () => {
    expect(canProbeOwnDiscordMembership(`guilds/${guildId}/members/${userId}`, userId)).toBe(true);
    expect(
      canProbeOwnDiscordMembership(
        `guilds/${guildId}/members/123456789012345678`,
        userId,
      ),
    ).toBe(false);
  });
});
