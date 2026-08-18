import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const controller = new HealthController(null, null);

  it('reports liveness and version identity', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
    expect(controller.live().gitCommitSha).toBeDefined();
    expect(controller.version()).toEqual(controller.live());
  });

  it('reports readiness when no upstream URLs are configured', async () => {
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { activity: true, identity: true },
    });
  });

  it('fails ready when a configured upstream live probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 503 })));
    const withUpstreams = new HealthController('http://127.0.0.1:4400', null);
    await expect(withUpstreams.ready()).rejects.toMatchObject({ status: 503 });
    vi.unstubAllGlobals();
  });
});
