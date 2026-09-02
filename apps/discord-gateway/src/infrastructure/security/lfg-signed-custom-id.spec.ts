import { describe, expect, it } from 'vitest';

import { createLfgCustomId, isLfgCustomId, parseLfgCustomId } from './lfg-signed-custom-id.js';

const secret = 's'.repeat(32);
const panel = 'a1b2c3d4e5f6';

describe('lfg-signed-custom-id', () => {
  it('creates and parses signed lfg custom ids', () => {
    const raw = createLfgCustomId(panel, 'join', secret, 'deadbeef0001');
    expect(isLfgCustomId(raw)).toBe(true);
    const parsed = parseLfgCustomId(raw, secret);
    expect(parsed.action).toBe('join');
    expect(parsed.param).toBe('deadbeef0001');
    expect(parsed.opaquePanelId).toBe(panel);
  });

  it('rejects tampered signatures', () => {
    const raw = createLfgCustomId(panel, 'watch', secret);
    expect(() => parseLfgCustomId(`${raw}x`, secret)).toThrow();
  });
});
