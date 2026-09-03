import { describe, expect, it } from 'vitest';

import {
  cancelInvitation,
  createPendingInvitation,
  discordDirectoryFixture,
  incomingInvitationFixture,
  isDiscordUserId,
  resolveDiscordIdentity,
  respondToInvitation,
} from './team-membership.js';

describe('team membership contract', () => {
  it('accepts only plausible Discord snowflake IDs', () => {
    expect(isDiscordUserId('994001220033445566')).toBe(true);
    expect(isDiscordUserId('mobbynzs_oak')).toBe(false);
    expect(isDiscordUserId('123')).toBe(false);
  });

  it('resolves the exact Discord identity before an invitation is created', () => {
    expect(resolveDiscordIdentity(discordDirectoryFixture, '994001220033445566')).toEqual({
      ok: true,
      identity: discordDirectoryFixture[0],
      error: null,
    });
    expect(resolveDiscordIdentity(discordDirectoryFixture, '994001220033445567')).toEqual({
      ok: false,
      identity: null,
      error: 'identity_not_found',
    });
  });

  it('creates one pending invitation without granting membership', () => {
    const input = {
      teamId: 'asteria',
      teamName: 'Asteria',
      inviterName: 'Mateusz',
      recipient: discordDirectoryFixture[0]!,
      createdLabel: 'teraz',
      expiresLabel: 'za 7 dni',
      operationId: 'invite-op-1',
    } as const;
    const invitations = createPendingInvitation([], input);

    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ status: 'pending', revision: 1 });
    expect(createPendingInvitation(invitations, { ...input, operationId: 'invite-op-2' })).toBe(
      invitations,
    );
  });

  it('makes invitation decisions idempotent and revisioned', () => {
    const accepted = respondToInvitation(incomingInvitationFixture, 'accept');

    expect(accepted).toMatchObject({ status: 'accepted', revision: 2 });
    expect(respondToInvitation(accepted, 'decline')).toBe(accepted);
    expect(cancelInvitation(accepted)).toBe(accepted);
  });
});
