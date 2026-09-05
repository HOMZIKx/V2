import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DISCORD_GATEWAY_BASE_URL,
  curlTipFor,
  fetchDiscordHealth,
  fetchLiveHealth,
  fetchReadyHealth,
  resolveDiscordGatewayBaseUrl,
} from './discord-gateway-health.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveDiscordGatewayBaseUrl', () => {
  it('defaults to local New Bot port 4100', () => {
    expect(resolveDiscordGatewayBaseUrl(undefined)).toBe(DEFAULT_DISCORD_GATEWAY_BASE_URL);
    expect(resolveDiscordGatewayBaseUrl('')).toBe(DEFAULT_DISCORD_GATEWAY_BASE_URL);
    expect(resolveDiscordGatewayBaseUrl('  ')).toBe(DEFAULT_DISCORD_GATEWAY_BASE_URL);
  });

  it('strips trailing slashes from env override', () => {
    expect(resolveDiscordGatewayBaseUrl('http://gateway.local:4100/')).toBe(
      'http://gateway.local:4100',
    );
  });
});

describe('curlTipFor', () => {
  it('builds a copy-pasteable curl against the base URL', () => {
    expect(curlTipFor('/health/live', 'http://127.0.0.1:4100')).toBe(
      'curl -sS "http://127.0.0.1:4100/health/live"',
    );
  });
});

describe('health fetchers', () => {
  it('returns live payload on 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    });

    const result = await fetchLiveHealth('http://127.0.0.1:4100', fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ status: 'ok' });
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/health/live',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('surfaces HTTP errors with body and curl tip (ready 503)', async () => {
    const body = {
      status: 'unavailable',
      discordEnabled: true,
      discordState: 'connecting',
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => body,
    });

    const result = await fetchReadyHealth('http://127.0.0.1:4100', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('http');
      expect(result.httpStatus).toBe(503);
      expect(result.body).toEqual(body);
      expect(result.curlTip).toContain('/health/ready');
    }
  });

  it('maps network/CORS failures to a clear Polish message + curl tip', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await fetchDiscordHealth('http://127.0.0.1:4100', fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('network');
      expect(result.error).toMatch(/CORS/i);
      expect(result.curlTip).toBe('curl -sS "http://127.0.0.1:4100/health/discord"');
    }
  });

  it('returns discord snapshot fields without inventing defaults on success', async () => {
    const payload = {
      enabled: true,
      state: 'ready',
      guildId: '1534228693017432124',
      pingMs: 12,
      uptimeSeconds: 9,
      commandsRegistered: true,
      isolationOk: true,
      lastError: null,
      gitCommitSha: 'abc1234',
      panelRenderer: 'components-v2-container',
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await fetchDiscordHealth('http://127.0.0.1:4100', fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(payload);
    }
  });
});
