import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCharacterTimerPanelFromBot } from './read-character-timer-panel.js';

const DISCORD_ID = '123456789012345678';
const APP_ID = 'owner-app-id';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readCharacterTimerPanelFromBot', () => {
  it('uses the service-authenticated workspace read for background timer panels', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(
        'http://player-team/player-team/v1/internal/discord/workspaces/team-1/state',
      );
      expect(new Headers(init?.headers).get('x-discord-gateway-secret')).toBe('service-secret');
      expect(new Headers(init?.headers).get('x-discord-user-id')).toBe(DISCORD_ID);
      return Response.json({
        viewerAppId: APP_ID,
        state: {
          id: 'team-1',
          name: 'Destiled',
          members: [{ id: APP_ID, role: 'owner' }],
          characters: [
            {
              id: 'char-1',
              name: 'KuzynPasek',
              responsibleMemberId: APP_ID,
              archived: false,
            },
          ],
          timers: [
            {
              id: 'timer-skill-book',
              characterId: 'char-1',
              label: 'Księga umiejętności',
              status: 'ready',
            },
          ],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await readCharacterTimerPanelFromBot({
      baseUrl: 'http://player-team',
      demoViewerHeader: 'x-demo-viewer-id',
      viewerId: DISCORD_ID,
      workspaceId: 'team-1',
      serviceSecret: 'service-secret',
    });

    expect(snapshot?.memberId).toBe(APP_ID);
    expect(snapshot?.selectedCharacter?.id).toBe('char-1');
    expect(snapshot?.timers.map((timer) => timer.id)).toEqual(['timer-skill-book']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a legacy workspace member through the viewer app id in demo fallback', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/player-team/v1/me/state')) {
        return Response.json({
          state: {
            viewer: { id: APP_ID, discordAccountId: DISCORD_ID },
          },
        });
      }
      if (url.endsWith('/player-team/v1/workspaces/team-1/state')) {
        return Response.json({
          state: {
            id: 'team-1',
            name: 'Destiled',
            members: [{ id: APP_ID, role: 'owner' }],
            characters: [
              {
                id: 'char-1',
                name: 'KuzynPasek',
                responsibleMemberId: APP_ID,
                archived: false,
              },
            ],
            timers: [
              {
                id: 'timer-skill-book',
                characterId: 'char-1',
                label: 'Księga umiejętności',
                status: 'ready',
              },
            ],
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await readCharacterTimerPanelFromBot({
      baseUrl: 'http://player-team',
      demoViewerHeader: 'x-demo-viewer-id',
      viewerId: DISCORD_ID,
      workspaceId: 'team-1',
      serviceSecret: '',
    });

    expect(snapshot?.memberId).toBe(APP_ID);
    expect(snapshot?.selectedCharacter?.id).toBe('char-1');
    expect(snapshot?.timers.map((timer) => timer.id)).toEqual(['timer-skill-book']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps direct Discord-member matching when the private viewer lookup is unavailable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/player-team/v1/me/state')) {
        return new Response(null, { status: 503 });
      }
      return Response.json({
        state: {
          id: 'team-1',
          name: 'Destiled',
          members: [{ id: DISCORD_ID, role: 'owner' }],
          characters: [],
          timers: [],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await readCharacterTimerPanelFromBot({
      baseUrl: 'http://player-team',
      demoViewerHeader: 'x-demo-viewer-id',
      viewerId: DISCORD_ID,
      workspaceId: 'team-1',
      serviceSecret: '',
    });

    expect(snapshot?.memberId).toBe(DISCORD_ID);
  });
});
