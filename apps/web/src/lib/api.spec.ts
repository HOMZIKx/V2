import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, buildApiUrl, listActivities, parseErrorBody, rsvp } from './api';

describe('parseErrorBody', () => {
  it('reads nested error.code and message', () => {
    expect(parseErrorBody({ error: { code: 'FORBIDDEN', message: 'Brak dostępu' } })).toEqual({
      message: 'Brak dostępu',
      code: 'FORBIDDEN',
      fields: {},
    });
  });

  it('falls back for empty bodies', () => {
    expect(parseErrorBody(null)).toEqual({
      message: 'Request failed',
      code: 'UNKNOWN',
      fields: {},
    });
  });
});

describe('buildApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds activity list URL with guildId query', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    expect(buildApiUrl('/activity/v1/activities', { guildId: 'g1' })).toBe(
      'http://127.0.0.1:4000/activity/v1/activities?guildId=g1',
    );
  });

  it('omits empty query values', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    expect(buildApiUrl('/activity/v1/me/activities', { guildId: undefined })).toBe(
      'http://127.0.0.1:4000/activity/v1/me/activities',
    );
  });
});

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('lists activities with credentials include', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ id: 'a1', name: 'Raid', guildId: 'g1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listActivities('g1');
    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls.at(0) as unknown as [string, RequestInit | undefined];
    expect(call[0]).toContain('/activity/v1/activities?guildId=g1');
    expect(call[1]?.credentials).toBe('include');
  });

  it('sends Idempotency-Key on RSVP mutation', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ waitlistPosition: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await rsvp('act-1', 'status-1');
    const call = fetchMock.mock.calls.at(0) as unknown as [string, RequestInit | undefined];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(call[1]?.body).toBe(JSON.stringify({ statusDefId: 'status-1' }));
  });

  it('throws ApiClientError with status and code', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4000');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Nope' } }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    await expect(listActivities('g1')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 403,
      code: 'FORBIDDEN',
    } satisfies Partial<ApiClientError>);
  });
});
