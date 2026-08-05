import { describe, expect, it } from 'vitest';

import { authorizePanelOperator, isAllowedGuild } from './authorization.js';

describe('authorization', () => {
  it('allows operators from allowlist', () => {
    expect(
      authorizePanelOperator({
        userId: '111111111111111111',
        operatorIds: ['111111111111111111'],
      }),
    ).toEqual({ allowed: true, reason: 'operator' });
  });

  it('allows Manage Guild bit', () => {
    expect(
      authorizePanelOperator({
        userId: '999999999999999999',
        operatorIds: [],
        memberPermissionsBitfield: 0x20n,
      }),
    ).toEqual({ allowed: true, reason: 'manage_guild' });
  });

  it('denies non-operators without Manage Guild', () => {
    expect(
      authorizePanelOperator({
        userId: '999999999999999999',
        operatorIds: ['111111111111111111'],
        memberPermissionsBitfield: 0n,
      }),
    ).toEqual({ allowed: false, reason: 'denied' });
  });

  it('isolates guild membership checks', () => {
    expect(isAllowedGuild('1534228693017432124', '1534228693017432124')).toBe(true);
    expect(isAllowedGuild('1', '1534228693017432124')).toBe(false);
    expect(isAllowedGuild(null, '1534228693017432124')).toBe(false);
  });
});
