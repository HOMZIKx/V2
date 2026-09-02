import { describe, expect, it } from 'vitest';

import { evaluatePublicOrigin } from './public-origin.mjs';

describe('evaluatePublicOrigin', () => {
  it('rejects loopback and missing values', () => {
    expect(evaluatePublicOrigin('http://127.0.0.1:4200', { requireHttps: true }).reason).toBe(
      'loopback',
    );
    expect(evaluatePublicOrigin('', { requireHttps: true }).reason).toBe('missing');
    expect(evaluatePublicOrigin('https://v2-web.zeabur.app', { requireHttps: true }).ok).toBe(true);
  });
});
