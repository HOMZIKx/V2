import { beforeEach, describe, expect, it } from 'vitest';

import {
  checkRateLimit,
  clientKeyFromRequest,
  GATEWAY_RATE_LIMIT_RULES,
  RATE_LIMIT_MAX_BUCKETS,
  rateLimitStoreSizeForTests,
  resetRateLimitStoreForTests,
} from './rate-limit.js';

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
  });

  it('allows requests under the limit', () => {
    for (let index = 0; index < 30; index += 1) {
      expect(checkRateLimit('1.2.3.4', 'GET', '/identity/oauth/discord').allowed).toBe(true);
    }
  });

  it('blocks when OAuth start limit exceeded', () => {
    for (let index = 0; index < 30; index += 1) {
      checkRateLimit('1.2.3.4', 'GET', '/identity/oauth/discord');
    }
    const blocked = checkRateLimit('1.2.3.4', 'GET', '/identity/oauth/discord');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('scopes limits per client key', () => {
    for (let index = 0; index < 30; index += 1) {
      checkRateLimit('1.2.3.4', 'GET', '/identity/oauth/discord');
    }
    expect(checkRateLimit('9.9.9.9', 'GET', '/identity/oauth/discord').allowed).toBe(true);
  });

  it('applies method-specific rules for LFG join', () => {
    const rule = GATEWAY_RATE_LIMIT_RULES.find((entry) => entry.prefix.includes('lfg/join'));
    expect(rule).toBeDefined();
    expect(checkRateLimit('1.2.3.4', 'GET', '/activity/v1/lfg/join').allowed).toBe(true);
    expect(checkRateLimit('1.2.3.4', 'POST', '/activity/v1/lfg/join').allowed).toBe(true);
  });

  it('does not treat spoofed X-Forwarded-For as client identity', () => {
    expect(
      clientKeyFromRequest({
        ip: '203.0.113.5',
      }),
    ).toBe('203.0.113.5');
  });

  it('spoofed XFF cannot bypass limiter when server ip is authoritative', () => {
    for (let index = 0; index < 30; index += 1) {
      checkRateLimit('203.0.113.5', 'GET', '/identity/oauth/discord');
    }
    expect(checkRateLimit('203.0.113.5', 'GET', '/identity/oauth/discord').allowed).toBe(false);
    expect(checkRateLimit('1.1.1.1', 'GET', '/identity/oauth/discord').allowed).toBe(true);
  });

  it('removes expired buckets and caps store growth under many identities', () => {
    const testRule = [{ prefix: '/stress', max: 1, windowMs: 1_000 }] as const;
    let nowMs = 1_000;
    for (let index = 0; index < RATE_LIMIT_MAX_BUCKETS + 500; index += 1) {
      checkRateLimit(`client-${index}`, 'GET', '/stress/path', testRule, nowMs);
    }
    expect(rateLimitStoreSizeForTests()).toBeLessThanOrEqual(RATE_LIMIT_MAX_BUCKETS);

    nowMs += 2_000;
    checkRateLimit('fresh-client', 'GET', '/stress/path', testRule, nowMs);
    expect(rateLimitStoreSizeForTests()).toBeLessThanOrEqual(RATE_LIMIT_MAX_BUCKETS);
    expect(rateLimitStoreSizeForTests()).toBeGreaterThan(0);
  });
});
