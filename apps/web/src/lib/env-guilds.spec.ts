import { afterEach, describe, expect, it } from 'vitest';

import { ApiClientError } from './api.js';
import { buildDiscordLoginUrl, getApiBaseUrl } from './env.js';
import { readConfiguredGuilds, resolveInitialGuildId } from './guilds.js';
import { mapApiError } from './load-state.js';

describe('env helpers', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_IDENTITY_URL;
    delete process.env.NEXT_PUBLIC_WEB_ORIGIN;
  });

  it('defaults API base URL', () => {
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:4000');
  });

  it('builds Discord OAuth start URL with callback', () => {
    process.env.NEXT_PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:3000';
    process.env.NEXT_PUBLIC_IDENTITY_URL = 'http://127.0.0.1:4200';
    const url = buildDiscordLoginUrl('/moje');
    expect(url).toContain('/identity/oauth/discord?callbackURL=');
    expect(url).toContain(encodeURIComponent('http://127.0.0.1:3000/moje'));
  });
});

describe('guilds', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_WEB_GUILDS;
    delete process.env.NEXT_PUBLIC_DISCORD_TEST_GUILD_ID;
  });

  it('parses WEB_GUILDS JSON', () => {
    process.env.NEXT_PUBLIC_WEB_GUILDS = JSON.stringify([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
    ]);
    expect(readConfiguredGuilds()).toEqual([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
    ]);
  });

  it('falls back to single test guild id', () => {
    process.env.NEXT_PUBLIC_DISCORD_TEST_GUILD_ID = '1534228693017432124';
    expect(readConfiguredGuilds()).toEqual([{ id: '1534228693017432124', name: 'Serwer testowy' }]);
  });

  it('does not use a raw id as the visible guild name', () => {
    process.env.NEXT_PUBLIC_WEB_GUILDS = JSON.stringify([
      { id: '1534228693017432124', name: '  ' },
    ]);
    expect(readConfiguredGuilds()).toEqual([{ id: '1534228693017432124', name: 'Serwer' }]);
  });

  it('uses first guild when storage is empty', () => {
    const guilds = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    expect(resolveInitialGuildId(guilds)).toBe('a');
    expect(resolveInitialGuildId([])).toBeNull();
  });
});

describe('mapApiError', () => {
  it('maps unauthorized and forbidden', () => {
    expect(mapApiError(new ApiClientError('no', { status: 401 }))).toEqual({
      kind: 'unauthorized',
    });
    expect(mapApiError(new ApiClientError('no', { status: 403 }))).toEqual({ kind: 'forbidden' });
  });

  it('maps not found, conflict and unavailable', () => {
    expect(mapApiError(new ApiClientError('gone', { status: 404 }))).toEqual({ kind: 'not_found' });
    expect(mapApiError(new ApiClientError('stale', { status: 409 })).kind).toBe('conflict');
    expect(mapApiError(new ApiClientError('down', { status: 503 })).kind).toBe('unavailable');
  });

  it('never uses Failed to fetch as primary copy', () => {
    const mapped = mapApiError(new TypeError('Failed to fetch'));
    expect(mapped).toEqual({
      kind: 'unavailable',
      message: 'Ta funkcja jest chwilowo niedostępna.',
    });
  });
});
