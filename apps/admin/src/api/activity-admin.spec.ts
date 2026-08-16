import { afterEach, describe, expect, it, vi } from 'vitest';

import { getReadiness } from './activity-admin.js';
import { ApiClientError } from './http.js';

describe('activity-admin API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches readiness with credentials include', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            state: 'CONFIGURATION_REQUIRED',
            issues: [{ code: 'NO_TYPES', message: 'Seed types' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getReadiness('guild-1');
    expect(result.state).toBe('CONFIGURATION_REQUIRED');
    expect(result.issues).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledOnce();
    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const init = (firstCall as unknown as [string, RequestInit | undefined])[1];
    expect(init?.credentials).toBe('include');
  });

  it('maps API status READY to UI state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 'READY', ready: true, issues: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );

    const result = await getReadiness('guild-1');
    expect(result.state).toBe('READY');
  });

  it('maps forbidden API errors', async () => {
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

    await expect(getReadiness('guild-1')).rejects.toBeInstanceOf(ApiClientError);
  });
});
