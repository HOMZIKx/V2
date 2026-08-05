import { describe, expect, it } from 'vitest';

import { buildSyntheticEmail, isSyntheticEmail } from './synthetic-email.js';

describe('buildSyntheticEmail', () => {
  it('is deterministic for the same provider and account id', () => {
    const first = buildSyntheticEmail('discord', '123456789');
    const second = buildSyntheticEmail('discord', '123456789');
    expect(first).toBe(second);
  });

  it('produces the documented v2+{provider}+{hash}@{provider}.invalid shape', () => {
    const email = buildSyntheticEmail('discord', '123456789');
    expect(email).toMatch(/^v2\+discord\+[0-9a-f]{16}@discord\.invalid$/);
  });

  it('differs by account id and by provider', () => {
    expect(buildSyntheticEmail('discord', 'a')).not.toBe(buildSyntheticEmail('discord', 'b'));
    expect(buildSyntheticEmail('discord', 'a')).not.toBe(buildSyntheticEmail('google', 'a'));
  });
});

describe('isSyntheticEmail', () => {
  it('recognises synthetic addresses', () => {
    expect(isSyntheticEmail(buildSyntheticEmail('discord', '42'))).toBe(true);
    expect(isSyntheticEmail(buildSyntheticEmail('google', '42'))).toBe(true);
  });

  it('rejects real, empty, and nullish addresses', () => {
    expect(isSyntheticEmail('user@example.com')).toBe(false);
    expect(isSyntheticEmail('v2+discord+short@discord.invalid')).toBe(false);
    expect(isSyntheticEmail('')).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
    expect(isSyntheticEmail(undefined)).toBe(false);
  });
});
