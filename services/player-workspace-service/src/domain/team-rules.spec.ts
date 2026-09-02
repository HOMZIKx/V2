import { describe, expect, it } from 'vitest';

import { PlayerWorkspaceError } from './errors.js';
import { assertCanRemoveMember, requireOwner } from './team-rules.js';

describe('team-rules', () => {
  it('forbids members from owner actions', () => {
    expect(() =>
      requireOwner({
        teamId: 't',
        userId: 'u',
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: new Date().toISOString(),
        removedAt: null,
      }),
    ).toThrow(PlayerWorkspaceError);
  });

  it('blocks removing the sole owner', () => {
    expect(() =>
      assertCanRemoveMember({
        actorRole: 'OWNER',
        targetRole: 'OWNER',
        activeOwnerCount: 1,
        targetUserId: 'other',
        actorUserId: 'me',
      }),
    ).toThrow(/sole team owner/);
  });
});
