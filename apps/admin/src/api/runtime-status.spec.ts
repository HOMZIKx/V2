import { describe, expect, it, vi } from 'vitest';

import { getOperatorRuntimeStatus } from './runtime-status.js';

describe('getOperatorRuntimeStatus', () => {
  it('maps gateway live/ready into owner flags without exposing internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/health/live')) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: 'ok', gitCommitSha: 'abc1234' }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              checks: { activity: true, identity: true },
            }),
            { status: 200 },
          ),
        );
      }),
    );

    const status = await getOperatorRuntimeStatus();
    expect(status.api).toBe('yes');
    expect(status.activity).toBe('yes');
    expect(status.apiRevision).toBe('abc1234');
    expect(JSON.stringify(status)).not.toMatch(/token|secret|postgres/i);
    vi.unstubAllGlobals();
  });
});
