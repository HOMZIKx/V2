import { describe, expect, it } from 'vitest';

import { collectUpstreamSetCookies } from './upstream-set-cookie.js';

describe('collectUpstreamSetCookies', () => {
  it('uses getSetCookie when multiple cookies are present', () => {
    const headers = new Headers();
    headers.append(
      'set-cookie',
      'v2.identity.session_token=abc; Path=/; HttpOnly; Secure; SameSite=None',
    );
    headers.append('set-cookie', 'v2.identity.dont_remember=; Path=/; Max-Age=0');

    expect(collectUpstreamSetCookies(headers)).toEqual([
      'v2.identity.session_token=abc; Path=/; HttpOnly; Secure; SameSite=None',
      'v2.identity.dont_remember=; Path=/; Max-Age=0',
    ]);
  });

  it('returns an empty list when no Set-Cookie is present', () => {
    expect(collectUpstreamSetCookies(new Headers({ 'content-type': 'application/json' }))).toEqual(
      [],
    );
  });
});
