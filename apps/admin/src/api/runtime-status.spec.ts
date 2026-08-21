import { describe, expect, it, vi } from 'vitest';

import { getOperatorRuntimeStatus, mapDiscordOperatorFlags } from './runtime-status.js';

describe('mapDiscordOperatorFlags', () => {
  it('does not treat a guild inventory as Discord health', () => {
    expect(mapDiscordOperatorFlags(undefined)).toEqual({ discord: 'unknown', bot: 'unknown' });
  });

  it('maps ready to yes', () => {
    expect(mapDiscordOperatorFlags('ready')).toEqual({ discord: 'yes', bot: 'yes' });
  });

  it('maps disconnected to no', () => {
    expect(mapDiscordOperatorFlags('disconnected')).toEqual({ discord: 'no', bot: 'no' });
  });

  it('maps unknown to unknown and disabled to disabled', () => {
    expect(mapDiscordOperatorFlags('unknown')).toEqual({ discord: 'unknown', bot: 'unknown' });
    expect(mapDiscordOperatorFlags('disabled')).toEqual({
      discord: 'disabled',
      bot: 'disabled',
    });
  });
});

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
        if (url.includes('/diagnostics/dependencies')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                discordGateway: 'ok',
                bot: 'connected',
                activityToDiscord: 'ok',
                authorization: 'ok',
                guildInventory: 'ok',
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              checks: { activity: 'ok', identity: 'ok' },
              discord: { state: 'ready' },
            }),
            { status: 200 },
          ),
        );
      }),
    );

    const status = await getOperatorRuntimeStatus();
    expect(status.api).toBe('yes');
    expect(status.activity).toBe('yes');
    expect(status.discordGateway).toBe('yes');
    expect(status.bot).toBe('yes');
    expect(status.activityToDiscord).toBe('yes');
    expect(status.authorization).toBe('yes');
    expect(status.guildInventory).toBe('yes');
    expect(status.apiRevision).toBe('abc1234');
    expect(JSON.stringify(status)).not.toMatch(/token|secret|postgres/i);
    vi.unstubAllGlobals();
  });

  it('keeps Discord unknown when health is missing even if the API is up', async () => {
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
        if (url.includes('/diagnostics/dependencies')) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'ok', checks: { activity: 'ok' } }), {
            status: 200,
          }),
        );
      }),
    );
    const status = await getOperatorRuntimeStatus();
    expect(status.discordGateway).toBe('unknown');
    expect(status.bot).toBe('unknown');
    expect(status.activityToDiscord).toBe('unknown');
    vi.unstubAllGlobals();
  });

  it('does not infer Activity→Discord OK from a green Discord Gateway flag alone', async () => {
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
        if (url.includes('/diagnostics/dependencies')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                discordGateway: 'ok',
                bot: 'connected',
                activityToDiscord: 'configuration_invalid',
                authorization: 'ok',
                guildInventory: 'configuration_invalid',
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              checks: { activity: 'ok', identity: 'ok' },
              discord: { state: 'ready' },
            }),
            { status: 200 },
          ),
        );
      }),
    );
    const status = await getOperatorRuntimeStatus();
    expect(status.discordGateway).toBe('yes');
    expect(status.bot).toBe('yes');
    expect(status.activityToDiscord).toBe('no');
    expect(status.activityToDiscordDetail).toContain('konfiguracji');
    expect(status.guildInventory).toBe('no');
    vi.unstubAllGlobals();
  });
});
