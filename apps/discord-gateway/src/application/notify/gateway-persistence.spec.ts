import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getGatewayPersistenceStatus,
  resolveGatewayPersistenceBaseDir,
} from './gateway-persistence.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('gateway panel persistence', () => {
  it('prefers DISCORD_GATEWAY_DATA_DIR', () => {
    vi.stubEnv('DISCORD_GATEWAY_DATA_DIR', '/mounted/discord');
    vi.stubEnv('DESTILED_DATA_DIR', '/legacy');

    expect(resolveGatewayPersistenceBaseDir()).toEqual({
      baseDir: '/mounted/discord',
      status: {
        source: 'configured',
        temporaryFallback: false,
        dataDirConfigured: true,
      },
    });
  });

  it('keeps DESTILED_DATA_DIR as a backwards-compatible persistent-path source', () => {
    vi.stubEnv('DISCORD_GATEWAY_DATA_DIR', '');
    vi.stubEnv('DESTILED_DATA_DIR', '/legacy');

    expect(getGatewayPersistenceStatus()).toEqual({
      source: 'legacy',
      temporaryFallback: false,
      dataDirConfigured: true,
    });
  });

  it('marks tmpdir fallback explicitly as temporary', () => {
    vi.stubEnv('DISCORD_GATEWAY_DATA_DIR', '');
    vi.stubEnv('DESTILED_DATA_DIR', '');

    const resolved = resolveGatewayPersistenceBaseDir();
    expect(resolved.baseDir.length).toBeGreaterThan(0);
    expect(resolved.status).toEqual({
      source: 'temporary',
      temporaryFallback: true,
      dataDirConfigured: false,
    });
  });
});
