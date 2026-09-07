import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmCharacterProgressTimerFromBot,
  snoozeCharacterProgressTimerFromBot,
} from './confirm-character-timer.js';
import { inferProgressionKind, restartAfterDone } from './progression-restart.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('confirmCharacterProgressTimerFromBot viewer aliases', () => {
  it('finds timer under bare snowflake when bot passes discord: prefix', async () => {
    const snowflake = '808066932753563668';
    const timerId = 'timer-ksiega-1';
    const state = {
      workspaces: [
        {
          id: 'ws-1',
          revision: 3,
          characters: [{ id: 'char-1', name: 'Oak' }],
          timers: [
            {
              id: timerId,
              characterId: 'char-1',
              label: 'Ksiega',
              status: 'ready',
            },
          ],
          history: [],
        },
      ],
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const viewer = headers?.['x-demo-viewer-id'];
      if (init?.method === 'GET' || !init?.method) {
        if (viewer === snowflake) {
          return new Response(JSON.stringify({ state, revision: 7 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ state: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (init?.method === 'PUT') {
        expect(viewer).toBe(snowflake);
        return new Response(JSON.stringify({ revision: 8 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected ${init?.method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await confirmCharacterProgressTimerFromBot({
      baseUrl: 'http://127.0.0.1:4400',
      demoViewerHeader: 'x-demo-viewer-id',
      viewerId: `discord:${snowflake}`,
      timerId,
      actorName: 'Mateusz',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedViewerId).toBe(snowflake);
      expect(result.label).toBe('Ksiega');
    }
    const getViewers = fetchMock.mock.calls
      .filter((c) => (c[1])?.method !== 'PUT')
      .map((c) => (c[1] as RequestInit).headers as Record<string, string>)
      .map((h) => h['x-demo-viewer-id']);
    expect(getViewers[0]).toBe(snowflake);
  });
});

describe('confirmCharacterProgressTimerFromBot EQ restart', () => {
  it('restarts Ksiega with midnight readyAtIso (not hardcoded +1h)', async () => {
    const snowflake = '808066932753563668';
    const timerId = 'timer-ksiega-1';
    const state = {
      workspaces: [
        {
          id: 'ws-1',
          revision: 3,
          characters: [{ id: 'char-1', name: 'Oak' }],
          timers: [
            {
              id: timerId,
              characterId: 'char-1',
              label: 'Ksiega umiejetnosci',
              kind: 'skill_book',
              status: 'ready',
              durationMinutes: 60,
            },
          ],
          history: [],
        },
      ],
    };

    let putBody: unknown = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ revision: 8 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ state, revision: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const before = Date.now();
    const result = await confirmCharacterProgressTimerFromBot({
      baseUrl: 'http://127.0.0.1:4400',
      demoViewerHeader: 'x-demo-viewer-id',
      viewerId: snowflake,
      timerId,
      actorName: 'Mateusz',
    });
    expect(result.ok).toBe(true);

    const expected = restartAfterDone('skill_book', new Date(before));
    const timers = (
      putBody as { state: { workspaces: Array<{ timers: Array<Record<string, unknown>> }> } }
    ).state.workspaces[0]!.timers;
    const updated = timers.find((t) => t.id === timerId)!;
    expect(updated.status).toBe('running');
    expect(updated.remainingLabel).toBe(expected.remainingLabel);
    expect(String(updated.readyAtIso).slice(0, 16)).toBe(expected.readyAtIso.slice(0, 16));
    expect(inferProgressionKind('Ksiega umiejetnosci')).toBe('skill_book');
  });
});

describe('snoozeCharacterProgressTimerFromBot', () => {
  it('sets reminderState on without starting a new cycle', async () => {
    const snowflake = '808066932753563668';
    const timerId = 'timer-kamien-1';
    const state = {
      workspaces: [
        {
          id: 'ws-1',
          revision: 1,
          characters: [{ id: 'char-1', name: 'Oak' }],
          timers: [
            {
              id: timerId,
              characterId: 'char-1',
              label: 'Kamien Duchowy',
              kind: 'soul_stone',
              status: 'ready',
              reminderState: 'off',
              discordReminder: false,
            },
          ],
          history: [],
        },
      ],
    };
    let putBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          putBody = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ revision: 2 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ state, revision: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const result = await snoozeCharacterProgressTimerFromBot({
      baseUrl: 'http://127.0.0.1:4400',
      demoViewerHeader: 'x-demo-viewer-id',
      viewerId: snowflake,
      timerId,
      actorName: 'Mateusz',
      reminderMinutesBefore: 45,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reminderMinutesBefore).toBe(45);
    }
    const updated = (
      putBody as { state: { workspaces: Array<{ timers: Array<Record<string, unknown>> }> } }
    ).state.workspaces[0]!.timers.find((t) => t.id === timerId)!;
    expect(updated.status).toBe('ready');
    expect(updated.reminderState).toBe('on');
    expect(updated.discordReminder).toBe(true);
  });
});
