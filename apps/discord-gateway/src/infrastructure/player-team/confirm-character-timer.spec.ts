import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmCharacterProgressTimerFromBot } from './confirm-character-timer.js';

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
      .filter((c) => (c[1] as RequestInit | undefined)?.method !== 'PUT')
      .map((c) => (c[1] as RequestInit).headers as Record<string, string>)
      .map((h) => h['x-demo-viewer-id']);
    expect(getViewers[0]).toBe(snowflake);
  });
});
