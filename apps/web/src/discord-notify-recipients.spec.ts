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
});
