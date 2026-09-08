import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const context = { params: Promise.resolve({ path: ['access'] }) };

function identityFetch(discordUserId: string) {
  return vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'viewer' } }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ accounts: [{ provider: 'discord', accountId: discordUserId }] }),
        { status: 200 },
      ),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TECHNIKA_ADMIN_DISCORD_IDS;
});

describe('GET /api/technik/access', () => {
  it('rejects a request without an authenticated session cookie', async () => {
    const response = await GET(new Request('http://localhost/api/technik/access'), context);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ allowed: false, error: 'unauthorized' });
  });

  it('returns allowed=false for an authenticated ordinary member', async () => {
    identityFetch('111111111111111111');
    const response = await GET(
      new Request('http://localhost/api/technik/access', { headers: { cookie: 'session=member' } }),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, allowed: false });
  });

  it('returns allowed=true for the configured Technik Discord user', async () => {
    process.env.TECHNIKA_ADMIN_DISCORD_IDS = '222222222222222222,333333333333333333';
    identityFetch('333333333333333333');
    const response = await GET(
      new Request('http://localhost/api/technik/access', { headers: { cookie: 'session=technik' } }),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, allowed: true });
  });
});
