import { afterEach, describe, expect, it, vi } from 'vitest';

import { runRuntimeDoctor } from '../scripts/runtime-doctor.mjs';

describe('runtime doctor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes static registry and frontend contract checks', async () => {
    const summary = await runRuntimeDoctor({});
    expect(summary.ok).toBe(true);
    expect(summary.checks.some((check) => check.code === 'DOCKERFILE_MAPPING')).toBe(true);
    expect(
      summary.checks.some((check) => check.code === 'ADMIN_API_BASE' && check.status === 'PASS'),
    ).toBe(true);
  });

  it('explains a reachable API probe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).endsWith('/health/live')) {
          return {
            status: 200,
            json: async () => ({ status: 'ok', gitCommitSha: 'abc1234' }),
          };
        }
        return { status: 200, json: async () => ({}) };
      }),
    );

    const summary = await runRuntimeDoctor({
      V2_SMOKE_API_BASE: 'https://v2-api.example',
      V2_EXPECTED_SHA: 'abc1234',
    });
    const api = summary.checks.find((check) => check.code === 'API_GATEWAY');
    const revision = summary.checks.find((check) => check.code === 'VERSION_DRIFT');
    expect(api?.status).toBe('PASS');
    expect(revision?.status).toBe('PASS');
    expect(revision?.observed).toContain('MATCH');
  });

  it('fails OAuth loopback when the start Location points at localhost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).includes('/identity/oauth/discord')) {
          return {
            status: 302,
            headers: {
              get: (name: string) =>
                name.toLowerCase() === 'location'
                  ? 'http://127.0.0.1:4200/identity/oauth/discord'
                  : null,
            },
            json: async () => ({}),
          };
        }
        return {
          status: 200,
          headers: { get: () => null },
          json: async () => ({ status: 'ok', gitCommitSha: 'abc1234' }),
          text: async () =>
            '<a href="https://v2-api.zeabur.app/identity/oauth/discord">Zaloguj</a>',
        };
      }),
    );
    const summary = await runRuntimeDoctor({
      V2_SMOKE_API_BASE: 'https://v2-api.zeabur.app',
      V2_SMOKE_WEB_BASE: 'https://v2-web.zeabur.app',
    });
    const loopback = summary.checks.find((check) => check.code === 'OAUTH_LOOPBACK');
    expect(loopback?.status).toBe('FAIL');
  });

  it('fails when deployed WWW login HTML embeds a loopback Identity origin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).includes('/logowanie')) {
          return {
            status: 200,
            headers: { get: () => null },
            json: async () => ({}),
            text: async () => '<a href="http://127.0.0.1:4200/identity/oauth/discord">Zaloguj</a>',
          };
        }
        return {
          status: 200,
          headers: { get: () => null },
          json: async () => ({ status: 'ok', gitCommitSha: 'abc1234' }),
          text: async () => '',
        };
      }),
    );
    const summary = await runRuntimeDoctor({
      V2_SMOKE_WEB_BASE: 'https://v2-web.zeabur.app',
    });
    const login = summary.checks.find((check) => check.code === 'WEB_LOGIN_ORIGIN');
    expect(login?.status).toBe('FAIL');
  });

  it('uses BLOCKED_EXTERNAL when a public URL cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    const summary = await runRuntimeDoctor({
      V2_SMOKE_ADMIN_BASE: 'https://v2-admin.example',
    });
    const admin = summary.checks.find((check) => check.code === 'ADMIN');
    expect(admin?.status).toBe('BLOCKED_EXTERNAL');
    expect(admin?.action).toContain('retry');
  });
});
