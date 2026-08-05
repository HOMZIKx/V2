import { describe, expect, it } from 'vitest';

import { SUPPORTED_PROVIDERS, isSupportedProvider } from './identity-models.js';

describe('isSupportedProvider', () => {
  it('accepts the active P2 Discord provider', () => {
    expect(isSupportedProvider('discord')).toBe(true);
    expect([...SUPPORTED_PROVIDERS]).toEqual(['discord']);
  });

  it('rejects deferred and unknown providers', () => {
    expect(isSupportedProvider('google')).toBe(false);
    expect(isSupportedProvider('github')).toBe(false);
    expect(isSupportedProvider('')).toBe(false);
  });
});
