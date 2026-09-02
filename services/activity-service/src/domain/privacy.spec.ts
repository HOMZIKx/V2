import { describe, expect, it } from 'vitest';

import {
  assertPrivateAccessAllowed,
  hashPrivateInviteToken,
  mintPrivateInviteToken,
} from './privacy.js';

describe('private activity access', () => {
  it('allows public visibility without invite', () => {
    expect(
      assertPrivateAccessAllowed({
        visibility: 'public',
        memberRoleIds: [],
        allowedRoleIds: [],
        inviteTokenHash: null,
      }),
    ).toBe(true);
  });

  it('allows private access via role allow-list', () => {
    expect(
      assertPrivateAccessAllowed({
        visibility: 'private',
        memberRoleIds: ['r-raid'],
        allowedRoleIds: ['r-raid'],
        inviteTokenHash: null,
      }),
    ).toBe(true);
  });

  it('allows private access via invite token hash match', () => {
    const { token, tokenHash } = mintPrivateInviteToken();
    expect(hashPrivateInviteToken(token)).toBe(tokenHash);
    expect(
      assertPrivateAccessAllowed({
        visibility: 'private',
        memberRoleIds: [],
        allowedRoleIds: [],
        inviteToken: token,
        inviteTokenHash: tokenHash,
      }),
    ).toBe(true);
  });

  it('denies private access without role or valid token (no obscurity bypass)', () => {
    expect(
      assertPrivateAccessAllowed({
        visibility: 'private',
        memberRoleIds: [],
        allowedRoleIds: ['r-other'],
        inviteToken: 'guess',
        inviteTokenHash: hashPrivateInviteToken('real'),
      }),
    ).toBe(false);
  });
});
