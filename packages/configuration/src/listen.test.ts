import { describe, expect, it } from 'vitest';

import { resolveHttpListen } from './listen.js';

describe('resolveHttpListen', () => {
  it('uses defaults in development', () => {
    expect(
      resolveHttpListen({
        defaultPort: 4100,
        defaultHost: '127.0.0.1',
        env: { NODE_ENV: 'development' },
      }),
    ).toEqual({ port: 4100, host: '127.0.0.1' });
  });

  it('binds 0.0.0.0 in production when HOST unset', () => {
    expect(
      resolveHttpListen({
        defaultPort: 4100,
        defaultHost: '127.0.0.1',
        env: { NODE_ENV: 'production' },
      }),
    ).toEqual({ port: 4100, host: '0.0.0.0' });
  });

  it('prefers PLATFORM PORT and HOST', () => {
    expect(
      resolveHttpListen({
        defaultPort: 4100,
        defaultHost: '127.0.0.1',
        env: { NODE_ENV: 'production', PORT: '8080', HOST: '0.0.0.0' },
      }),
    ).toEqual({ port: 8080, host: '0.0.0.0' });
  });
});
