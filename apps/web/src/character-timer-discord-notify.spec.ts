import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  buildCharacterTimerNotifyCopy,
  notifyCharacterProgressTimer,
} from './character-timer-discord-notify.js';

vi.mock('./discord-notify-api.js', () => ({
  buildCharacterTimersDeepLinkUrl: () =>
    'http://127.0.0.1:3000/teams/asteria/characters/nerwnicht?board=timers',
  buildCharacterTimerRoomSummary: () => ['Aalpsik · Jazda konna — gotowe'],
  postDiscordTimerNotify: vi.fn(async () => ({
    ok: true,
    delivery: 'dm',
    duplicate: false,
    messageId: 'm1',
  })),
  postDiscordTimerResetNotify: vi.fn(async () => ({ ok: true, sent: 1 })),
}));

import { postDiscordTimerNotify } from './discord-notify-api.js';

describe('character-timer-discord-notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds Polish reset copy for character timer', () => {
    const copy = buildCharacterTimerNotifyCopy({
      characterName: 'NerwNicht',
      actorName: 'Mateusz',
      kind: 'reset',
      timer: {
        id: 'timer-1',
        characterId: 'nerwnicht',
        label: 'Księga umiejętności',
        detail: 'M8→M9',
        status: 'running',
        readyAtIso: '2026-09-06T18:00:00.000Z',
        remainingLabel: 'za 60 min',
        progressPercent: 4,
        lastActorName: 'Mateusz',
        lastConfirmedAt: 'teraz',
        discordReminder: true,
        reminderState: 'on',
        operationId: 'op1',
      },
    });
    expect(copy.title).toContain('Księga');
    expect(copy.body).toContain('Mateusz');
  });

  it('skips notify when viewer has no discordAccountId', async () => {
    const result = await notifyCharacterProgressTimer({
      workspace: {
        id: 'asteria',
        name: 'Asteria',
        description: '',
        archived: false,
        members: [],
        characters: [{ id: 'nerwnicht', name: 'NerwNicht' } as never],
        items: [],
        timers: [
          {
            id: 'timer-1',
            characterId: 'nerwnicht',
            label: 'Księga umiejętności',
            detail: '',
            status: 'running',
            readyAtIso: null,
            remainingLabel: '',
            progressPercent: 4,
            lastActorName: null,
            lastConfirmedAt: null,
            discordReminder: true,
            reminderState: 'on',
            operationId: null,
          },
        ],
        tasks: [],
        notes: [],
        history: [],
        invitations: [],
        revision: 1,
        updatedLabel: 'teraz',
      } as never,
      timer: {
        id: 'timer-1',
        characterId: 'nerwnicht',
        label: 'Księga umiejętności',
        detail: '',
        status: 'running',
        readyAtIso: null,
        remainingLabel: '',
        progressPercent: 4,
        lastActorName: null,
        lastConfirmedAt: null,
        discordReminder: true,
        reminderState: 'on',
        operationId: 'op',
      },
      viewer: {
        id: 'mateusz',
        displayName: 'Mateusz',
        discordDisplayName: 'Mateusz',
        initials: 'M',
      },
      actorName: 'Mateusz',
      kind: 'reset',
    });
    expect(result.sent).toBe(0);
    expect(postDiscordTimerNotify).not.toHaveBeenCalled();
  });

  it('posts character timer payload with Gotowe path fields', async () => {
    const result = await notifyCharacterProgressTimer({
      workspace: {
        id: 'asteria',
        name: 'Asteria',
        description: '',
        archived: false,
        members: [
          {
            id: 'mateusz',
            displayName: 'Mateusz',
            initials: 'M',
            role: 'owner',
            state: 'unknown',
            discordAccountId: '123456789012345678',
          },
        ],
        characters: [{ id: 'nerwnicht', name: 'NerwNicht' } as never],
        items: [],
        timers: [],
        tasks: [],
        notes: [],
        history: [],
        invitations: [],
        revision: 1,
        updatedLabel: 'teraz',
      } as never,
      timer: {
        id: 'timer-ksiega-1',
        characterId: 'nerwnicht',
        label: 'Księga umiejętności',
        detail: '',
        status: 'running',
        readyAtIso: '2026-09-06T19:00:00.000Z',
        remainingLabel: 'za 60 min',
        progressPercent: 4,
        lastActorName: 'Mateusz',
        lastConfirmedAt: 'teraz',
        discordReminder: true,
        reminderState: 'on',
        operationId: 'op1',
      },
      viewer: {
        id: 'mateusz',
        displayName: 'Mateusz',
        discordDisplayName: 'Mateusz',
        initials: 'M',
        discordAccountId: '123456789012345678',
      },
      actorName: 'Mateusz',
      kind: 'reset',
    });
    expect(result.sent).toBe(1);
    expect(postDiscordTimerNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: '123456789012345678',
        characterId: 'nerwnicht',
        timerId: 'timer-ksiega-1',
        timerLabel: 'Księga umiejętności',
        includeButtons: true,
        kind: 'reset',
      }),
    );
  });
});
