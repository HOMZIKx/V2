import { describe, expect, it } from 'vitest';

import { authoritativeNotifyRecipients } from './discord-notify-recipients';

const OWNER = '123456789012345678';
const MEMBER = '223456789012345678';
const MUTED = '323456789012345678';

describe('authoritativeNotifyRecipients', () => {
  it('keeps the timer owner in the character-timer DM audience', () => {
    const workspace = {
      notifyPrefs: { characterTimers: true, kingdomWar: true },
      members: [
        { id: 'owner-app-id', discordAccountId: OWNER, notifyPrefs: { characterTimers: true } },
        { id: 'member-app-id', discordAccountId: MEMBER },
        { id: 'muted-app-id', discordAccountId: MUTED, notifyPrefs: { characterTimers: false } },
      ],
    };

    expect(authoritativeNotifyRecipients(workspace, 'characterTimers')).toEqual([OWNER, MEMBER]);
  });

  it('respects a disabled team default unless a member explicitly opts in', () => {
    const workspace = {
      notifyPrefs: { characterTimers: false },
      members: [
        { id: 'owner-app-id', discordAccountId: OWNER },
        { id: 'member-app-id', discordAccountId: MEMBER, notifyPrefs: { characterTimers: true } },
      ],
    };

    expect(authoritativeNotifyRecipients(workspace, 'characterTimers')).toEqual([MEMBER]);
  });

  it('uses the server-verified Discord id for the matching legacy app member', () => {
    const workspace = {
      notifyPrefs: { characterTimers: true },
      members: [{ id: 'owner-app-id', notifyPrefs: { characterTimers: true } }],
    };

    expect(
      authoritativeNotifyRecipients(workspace, 'characterTimers', {
        appId: 'owner-app-id',
        discordId: OWNER,
      }),
    ).toEqual([OWNER]);
  });

  it('does not bypass a personal timer-DM opt-out when using the verified fallback', () => {
    const workspace = {
      notifyPrefs: { characterTimers: true },
      members: [{ id: 'owner-app-id', notifyPrefs: { characterTimers: false } }],
    };

    expect(
      authoritativeNotifyRecipients(workspace, 'characterTimers', {
        appId: 'owner-app-id',
        discordId: OWNER,
      }),
    ).toEqual([]);
  });

  it('never injects the verified Discord id into a different member row', () => {
    const workspace = {
      notifyPrefs: { characterTimers: true },
      members: [{ id: 'someone-else-app-id' }],
    };

    expect(
      authoritativeNotifyRecipients(workspace, 'characterTimers', {
        appId: 'owner-app-id',
        discordId: OWNER,
      }),
    ).toEqual([]);
  });
});
