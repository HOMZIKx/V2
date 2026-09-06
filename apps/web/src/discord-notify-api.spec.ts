import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { buildTimersDeepLinkUrl, postDiscordTimerNotify } from './discord-notify-api.js';

describe('discord-notify-api', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            delivery: 'dm',
            duplicate: false,
            messageId: 'm1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('posts to same-origin /api/discord-notify', async () => {
    const result = await postDiscordTimerNotify({
      discordUserId: '111111111111111111',
      title: 'Ping',
      body: 'Test',
      deepLinkUrl: 'http://127.0.0.1:3000/timers',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBe('m1');
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/discord-notify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps upstream errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: 'invalid_notify_secret' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const result = await postDiscordTimerNotify({
      discordUserId: '111111111111111111',
      title: 'Ping',
      body: 'Test',
      deepLinkUrl: 'http://127.0.0.1:3000/timers',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_notify_secret');
      expect(result.status).toBe(401);
    }
  });

  it('builds timers deep link from window origin when available', () => {
    expect(buildTimersDeepLinkUrl()).toMatch(/\/timers$/);
  });
});
