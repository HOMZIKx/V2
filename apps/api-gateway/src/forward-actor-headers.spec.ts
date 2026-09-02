import { describe, expect, it } from 'vitest';

import { resolveForwardActorHeaders } from './forward-actor-headers.js';

describe('resolveForwardActorHeaders', () => {
  it('is false by default', () => {
    expect(resolveForwardActorHeaders({})).toBe(false);
  });

  it('allows explicit DEV forwarding', () => {
    expect(
      resolveForwardActorHeaders({
        NODE_ENV: 'development',
        API_GATEWAY_FORWARD_ACTOR_HEADERS: 'true',
      }),
    ).toBe(true);
  });

  it('forces false in production even when the env flag is true', () => {
    expect(
      resolveForwardActorHeaders({
        NODE_ENV: 'production',
        API_GATEWAY_FORWARD_ACTOR_HEADERS: 'true',
      }),
    ).toBe(false);
  });
});
