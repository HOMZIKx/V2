import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCharacterTimerNotifyCopy,
  notifyCharacterProgressTimer,
  scheduleCharacterTimerReminder,
} from './character-timer-discord-notify.js';

vi.mock('./discord-notify-api.js', () => ({
  buildCharacterTimersDeepLinkUrl: () =>
    'http://127.0.0.1:3000/teams/asteria/characters/nerwnicht?view=timers',
  buildCharacterTimerRoomSummary: () => ['Aalpsik · Jazda konna — gotowe'],
  syncTeamCoordinationRecipients: vi.fn(() => Promise.resolve({ ok: true, count: 2 })),
  postDiscordTimerNotify: vi.fn(() =>
    Promise.resolve({
      ok: true,
      delivery: 'dm',
      duplicate: false,
      messageId: 'm1',
    }),
  ),
  postDiscordTimerResetNotify: vi.fn(() => Promise.resolve({ ok: true, sent: 1 })),
}));

import {
  postDiscordTimerNotify,
  postDiscordTimerResetNotify,
  syncTeamCoordinationRecipients,
} from './discord-notify-api.js';

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

  it('skips notify when the team has no resolvable Discord accounts', async () => {
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
    expect(syncTeamCoordinationRecipients).not.toHaveBeenCalled();
  });

  it('sends actor confirmation and broadcasts the refreshed card to the rest of the team', async () => {
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
          {
            id: 'aalpsik',
            displayName: 'Aalpsik',
            initials: 'A',
            role: 'member',
            state: 'unknown',
            discordAccountId: '223456789012345678',
          },
        ],
        characters: [{ id: 'nerwnicht', name: 'NerwNicht' } as never],
        items: [],
        timers: [
          {
            id: 'timer-ksiega-1',
            characterId: 'nerwnicht',
            label: 'Księga umiejętności',
            detail: '',
            status: 'ready',
            readyAtIso: '2026-09-06T19:00:00.000Z',
            remainingLabel: 'gotowe',
            progressPercent: 100,
            lastActorName: null,
            lastConfirmedAt: null,
            discordReminder: true,
            reminderState: 'on',
            operationId: null,
          },
          {
            id: 'timer-kamien-1',
            characterId: 'nerwnicht',
            label: 'Kamień Duchowy',
            detail: '',
            status: 'running',
            readyAtIso: '2099-01-01T00:00:00.000Z',
            remainingLabel: 'w toku',
            progressPercent: 20,
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
        id: 'timer-ksiega-1',
        characterId: 'nerwnicht',
        label: 'Księga umiejętności',
        detail: '',
        status: 'ready',
        readyAtIso: '2026-09-06T19:00:00.000Z',
        remainingLabel: 'gotowe',
        progressPercent: 100,
        lastActorName: null,
        lastConfirmedAt: null,
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

    expect(result.sent).toBe(2);
    expect(syncTeamCoordinationRecipients).toHaveBeenCalledWith([
      '123456789012345678',
      '223456789012345678',
    ]);
    expect(postDiscordTimerResetNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientDiscordUserIds: ['223456789012345678'],
        liveTimers: expect.arrayContaining([
          expect.objectContaining({ id: 'timer-ksiega-1' }),
          expect.objectContaining({ id: 'timer-kamien-1' }),
        ]),
      }),
    );
    expect(postDiscordTimerNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: '123456789012345678',
        characterId: 'nerwnicht',
        timerId: 'timer-ksiega-1',
        timerLabel: 'Księga umiejętności',
        liveTimers: expect.arrayContaining([
          expect.objectContaining({ id: 'timer-ksiega-1' }),
          expect.objectContaining({ id: 'timer-kamien-1' }),
        ]),
        includeButtons: true,
        kind: 'reset',
      }),
    );
  });

  it('does not schedule browser-local reminders', () => {
    expect(
      scheduleCharacterTimerReminder({
        endsAtIso: '2099-01-01T00:00:00.000Z',
        reminderMinutesBefore: 60,
        fire: vi.fn(),
      }),
    ).toBeNull();
  });
});
