import { describe, expect, it, vi } from 'vitest';

import { isGatewayReady, probeDiscordRuntime, probeUpstreamReady } from './health-probes.js';

describe('probeUpstreamReady', () => {
  it('reports not_configured when the URL is missing', async () => {
    await expect(probeUpstreamReady(null)).resolves.toBe('not_configured');
  });

  it('treats live-ok/ready-503 as unhealthy', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/health/ready')) {
        return Promise.resolve(new Response(JSON.stringify({ status: 'error' }), { status: 503 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    }) as unknown as typeof fetch;
    await expect(probeUpstreamReady('http://127.0.0.1:4400', fetchImpl)).resolves.toBe('unhealthy');
  });

  it('treats ready 200 as ok', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'ok', checks: { database: true } }), { status: 200 }),
      ),
    ) as unknown as typeof fetch;
    await expect(probeUpstreamReady('http://127.0.0.1:4400', fetchImpl)).resolves.toBe('ok');
  });

  it('reports disabled when the dependency is intentionally off', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'ok', authDisabled: true }), { status: 200 }),
      ),
    ) as unknown as typeof fetch;
    await expect(probeUpstreamReady('http://127.0.0.1:4200', fetchImpl)).resolves.toBe('disabled');
  });

  it('fails closed on timeout', async () => {
    const fetchImpl = vi.fn(() => {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    }) as unknown as typeof fetch;
    await expect(probeUpstreamReady('http://127.0.0.1:4400', fetchImpl)).resolves.toBe('unhealthy');
  });

  it('fails closed on malformed JSON', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('<html>nope</html>', { status: 200 })),
    ) as unknown as typeof fetch;
    await expect(probeUpstreamReady('http://127.0.0.1:4400', fetchImpl)).resolves.toBe('unhealthy');
  });
});

describe('isGatewayReady', () => {
  it('is ready when both dependencies are ok', () => {
    expect(isGatewayReady('ok', 'ok')).toBe(true);
  });

  it('is not ready when activity is unhealthy', () => {
    expect(isGatewayReady('unhealthy', 'ok')).toBe(false);
  });

  it('is not ready when identity is unhealthy', () => {
    expect(isGatewayReady('ok', 'unhealthy')).toBe(false);
  });
});

describe('probeDiscordRuntime', () => {
  it('returns unknown when discord-gateway URL is missing', async () => {
    await expect(probeDiscordRuntime(null)).resolves.toEqual({ state: 'unknown' });
  });

  it('maps ready snapshot to ready', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ status: 'ok', discordEnabled: true, discordState: 'ready' }),
          {
            status: 200,
          },
        ),
      ),
    ) as unknown as typeof fetch;
    await expect(probeDiscordRuntime('http://127.0.0.1:4100', fetchImpl)).resolves.toEqual({
      state: 'ready',
    });
  });

  it('maps 503 to disconnected', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'unavailable', discordState: 'failed' }), {
          status: 503,
        }),
      ),
    ) as unknown as typeof fetch;
    await expect(probeDiscordRuntime('http://127.0.0.1:4100', fetchImpl)).resolves.toEqual({
      state: 'disconnected',
    });
  });
});
