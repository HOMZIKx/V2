import { describe, expect, it, vi } from 'vitest';

import { ActivityHttpClient, ActivityHttpError } from './activity-http-client.js';

describe('ActivityHttpClient', () => {
  it('sends actor headers and idempotency key in headers mode', async () => {
    const fetchImpl = vi.fn((): Promise<Response> =>
      Promise.resolve(Response.json({ id: 'draft-1', guildId: 'g1', payload: {} })),
    );
    const client = new ActivityHttpClient({
      config: {
        baseUrl: 'http://127.0.0.1:4400',
        mode: 'headers',
        organizationId: 'org-1',
      },
      fetchImpl,
    });

    const draft = await client.createDraft(
      { guildId: 'g1', payload: { source: 'hub_create' } },
      { discordUserId: '111', idempotencyKey: 'idem-1' },
    );

    expect(draft.id).toBe('draft-1');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = call[1].headers as Record<string, string>;
    expect(headers['X-Actor-Discord-User-Id']).toBe('111');
    expect(headers['Idempotency-Key']).toBe('idem-1');
  });

  it('fails closed on network errors', async () => {
    const failingFetch: typeof fetch = () => {
      throw new Error('ECONNREFUSED');
    };
    const client = new ActivityHttpClient({
      config: {
        baseUrl: 'http://127.0.0.1:4400',
        mode: 'headers',
        organizationId: 'org-1',
      },
      fetchImpl: failingFetch,
    });

    await expect(client.getActivity('a1', { discordUserId: '111' })).rejects.toBeInstanceOf(
      ActivityHttpError,
    );
  });

  it('classifies 429 as RATE_LIMITED', async () => {
    const limitedFetch: typeof fetch = () =>
      Promise.resolve(new Response('slow down', { status: 429 }));
    const client = new ActivityHttpClient({
      config: {
        baseUrl: 'http://127.0.0.1:4400',
        mode: 'headers',
        organizationId: 'org-1',
      },
      fetchImpl: limitedFetch,
    });

    await expect(client.listInbox({ discordUserId: '111' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('sends actor headers for LFG search', async () => {
    const fetchImpl = vi.fn((): Promise<Response> =>
      Promise.resolve(Response.json({ matches: [] })),
    );
    const client = new ActivityHttpClient({
      config: {
        baseUrl: 'http://127.0.0.1:4400',
        mode: 'headers',
        organizationId: 'org-1',
      },
      fetchImpl,
    });

    await client.searchLfg(
      {
        guildId: 'g1',
        organizationId: 'org-1',
        activityTypeKey: 'azrael',
        characterClassSpecKey: 'warrior_body',
        characterSupportedRoles: ['TANK'],
        sessionRoles: ['TANK'],
        windowStartAt: '2026-08-22T10:00:00.000Z',
        windowEndAt: '2026-08-22T12:00:00.000Z',
      },
      { discordUserId: '111' },
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('/activity/v1/lfg/search');
    const headers = call[1].headers as Record<string, string>;
    expect(headers['X-Actor-Discord-User-Id']).toBe('111');
  });
});
