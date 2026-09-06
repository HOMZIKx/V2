import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EXPECTED_DISCORD_CONFIG_PATHS,
  activityAdminPath,
  fetchActivityAdminJson,
  isActivityAdminReadConfigured,
  resolveActivityAdminEnv,
} from './activity-admin-config.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('activity-admin-config', () => {
  it('requires both base URL and guild id for READ', () => {
    expect(isActivityAdminReadConfigured(resolveActivityAdminEnv(undefined, undefined))).toBe(false);
    expect(isActivityAdminReadConfigured(resolveActivityAdminEnv('http://127.0.0.1:3200', ''))).toBe(
      false,
    );
    expect(
      isActivityAdminReadConfigured(resolveActivityAdminEnv('http://127.0.0.1:3200/', '123')),
    ).toBe(true);
  });

  it('builds guild admin paths under activity/v1/admin', () => {
    expect(activityAdminPath('99', '/types')).toBe('/activity/v1/admin/guilds/99/types');
  });

  it('documents expected New Bot Discord config paths', () => {
    expect(EXPECTED_DISCORD_CONFIG_PATHS.some((p) => p.includes('/discord/v1/capabilities'))).toBe(
      true,
    );
    expect(EXPECTED_DISCORD_CONFIG_PATHS.some((p) => p.includes('/config/apply'))).toBe(true);
  });

  it('returns unset when env missing instead of inventing data', async () => {
    const result = await fetchActivityAdminJson('/config', { baseUrl: undefined, guildId: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unset');
    }
  });

  it('GETs config when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ revision: 1 }),
    });
    const result = await fetchActivityAdminJson(
      '/config',
      { baseUrl: 'http://127.0.0.1:3200', guildId: '42' },
      fetchImpl,
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3200/activity/v1/admin/guilds/42/config',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
