import { describe, expect, it, vi } from 'vitest';

import { resolveSessionActor } from './session-actor.resolver.js';

describe('resolveSessionActor', () => {
  it('returns null without cookie or identity base', async () => {
    await expect(resolveSessionActor(undefined, 'http://127.0.0.1:4200')).resolves.toBeNull();
    await expect(resolveSessionActor('a=1', null)).resolves.toBeNull();
  });

  it('maps Identity me + discord account to actor headers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'user-v2', name: 'Owner' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [{ provider: 'discord', accountId: 'discord-42' }],
          }),
          { status: 200 },
        ),
      );

    await expect(
      resolveSessionActor('v2.identity.session=abc', 'http://127.0.0.1:4200/', fetchImpl),
    ).resolves.toEqual({
      v2UserId: 'user-v2',
      discordUserId: 'discord-42',
      displayName: 'Owner',
      avatarUrl: null,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://127.0.0.1:4200/identity/me');
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe('http://127.0.0.1:4200/identity/accounts');
  });

  it('returns null when Identity lookup times out', async () => {
    const fetchImpl: typeof fetch = (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    };

    await expect(
      resolveSessionActor('cookie=1', 'http://127.0.0.1:4200', fetchImpl, 20),
    ).resolves.toBeNull();
  });

  it('returns null when session is unauthorized', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(
      resolveSessionActor('cookie=1', 'http://127.0.0.1:4200', fetchImpl),
    ).resolves.toBeNull();
  });
});
