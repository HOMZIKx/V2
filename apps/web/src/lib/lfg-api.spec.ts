import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './api';
import { createLfgWatch, listLfgWatches, searchLfg } from './lfg-api';

describe('lfg-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('searches LFG matches with credentials include', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    vi.stubEnv('NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID', 'org-1');
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ matches: [{ activityId: 'a1', matchReason: 'Pasujesz' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchLfg({
      guildId: 'g1',
      organizationId: 'org-1',
      activityTypeKey: 'azrael',
      characterId: '11111111-1111-4111-8111-111111111111',
      sessionRoles: ['DPS'],
      windowStartAt: '2026-08-22T18:00:00.000Z',
      windowEndAt: '2026-08-22T22:00:00.000Z',
    });

    expect(result.matches).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls.at(0) as unknown as [string, RequestInit | undefined];
    expect(call[0]).toContain('/activity/v1/lfg/search');
    expect(call[1]?.credentials).toBe('include');
  });

  it('creates LFG watch with idempotency key', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    vi.stubEnv('NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID', 'org-1');
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ intentId: 'intent-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createLfgWatch({
      guildId: 'g1',
      organizationId: 'org-1',
      characterId: 'char-1',
      activityTypeKey: 'azrael',
      sessionRoles: ['DPS'],
      windowStartAt: '2026-08-22T18:00:00.000Z',
      windowEndAt: '2026-08-22T22:00:00.000Z',
    });

    expect(result.intentId).toBe('intent-1');
    const call = fetchMock.mock.calls.at(0) as unknown as [string, RequestInit | undefined];
    const headers = call[1]?.headers;
    expect(headers).toBeDefined();
    const idempotencyKey =
      headers instanceof Headers
        ? headers.get('Idempotency-Key')
        : (headers as Record<string, string | undefined>)['Idempotency-Key'];
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey).toBeTruthy();
  });

  it('lists watches for guild', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [{ id: 'w1' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const items = await listLfgWatches('g1');
    expect(items).toHaveLength(1);
    const listCall = fetchMock.mock.calls.at(0) as unknown as [string, RequestInit | undefined];
    expect(listCall[0]).toContain('guildId=g1');
  });

  it('maps API errors to ApiClientError', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    vi.stubEnv('NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID', 'org-1');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Brak dostępu' } }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    await expect(
      searchLfg({
        guildId: 'g1',
        organizationId: 'org-1',
        activityTypeKey: 'azrael',
        characterId: '11111111-1111-4111-8111-111111111111',
        sessionRoles: ['DPS'],
        windowStartAt: new Date().toISOString(),
        windowEndAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});
