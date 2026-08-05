import { describe, expect, it } from 'vitest';

import { SUPPORTED_PROVIDERS, isSupportedProvider } from './identity-models.js';

describe('isSupportedProvider', () => {
  it('accepts the P2 providers', () => {
    expect(isSupportedProvider('discord')).toBe(true);
    expect(isSupportedProvider('google')).toBe(true);
    expect([...SUPPORTED_PROVIDERS]).toEqual(['discord', 'google']);
  });

  it('rejects unknown providers', () => {
    expect(isSupportedProvider('github')).toBe(false);
    expect(isSupportedProvider('')).toBe(false);
  });
});
