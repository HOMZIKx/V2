import { beforeEach, describe, expect, it } from 'vitest';

import {
  checkRateLimit,
  GATEWAY_RATE_LIMIT_RULES,
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
});
