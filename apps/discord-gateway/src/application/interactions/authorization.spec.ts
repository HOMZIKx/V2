import { describe, expect, it } from 'vitest';

import {
  authorizePanelOperator,
  isAllowedGuild,
  isAllowedInteractionContext,
} from './authorization.js';

describe('authorization', () => {
  it('allows configured operators', () => {
    expect(
      authorizePanelOperator({
        userId: '1',
        operatorIds: ['1'],
      }).allowed,
    ).toBe(true);
  });

  it('allows manage guild bit', () => {
    expect(
      authorizePanelOperator({
        userId: '9',
        operatorIds: [],
        memberPermissionsBitfield: 0x20n,
      }).reason,
    ).toBe('manage_guild');
  });

  it('isolates guilds', () => {
    expect(isAllowedGuild('a', 'a')).toBe(true);
    expect(isAllowedGuild('b', 'a')).toBe(false);
  });

  it('allows DM only when explicitly enabled', () => {
    expect(
      isAllowedInteractionContext({
        guildId: null,
        allowedGuildId: 'g',
        allowDm: true,
      }),
    ).toBe(true);
    expect(
      isAllowedInteractionContext({
        guildId: null,
        allowedGuildId: 'g',
        allowDm: false,
      }),
    ).toBe(false);
  });
});
