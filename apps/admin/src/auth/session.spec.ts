import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAdminSession } from './session.js';

describe('readAdminSession', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses VITE_ADMIN_DEV_GUILDS only in dev-actor mode', () => {
    vi.stubEnv('VITE_ADMIN_DEV_ACTOR_DISCORD_ID', '999888777666555444');
    vi.stubEnv('VITE_ADMIN_DEV_GUILDS', JSON.stringify([{ id: 'guild-a', name: 'Alpha' }]));
    const session = readAdminSession();
    expect(session.mode).toBe('dev-actor');
    expect(session.guilds).toEqual([{ id: 'guild-a', name: 'Alpha' }]);
  });

  it('never attaches DEV guilds in identity-cookie mode', () => {
    vi.stubEnv('VITE_ADMIN_DEV_ACTOR_DISCORD_ID', '');
    vi.stubEnv('VITE_ADMIN_DEV_GUILDS', JSON.stringify([{ id: 'guild-a', name: 'Alpha' }]));
    const session = readAdminSession();
    expect(session.mode).toBe('identity-cookie');
    expect(session.guilds).toEqual([]);
  });
});
