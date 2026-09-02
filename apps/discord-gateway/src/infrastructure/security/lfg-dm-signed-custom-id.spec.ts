import { describe, expect, it } from 'vitest';

import {
  createLfgDmCustomId,
  isLfgDmCustomId,
  parseLfgDmCustomId,
} from './lfg-dm-signed-custom-id.js';

const secret = 's'.repeat(32);
const activityOpaque = 'a1b2c3d4e5f6';

describe('lfg-dm-signed-custom-id', () => {
  it('creates and parses signed lfg dm custom ids', () => {
    const raw = createLfgDmCustomId(activityOpaque, 'join', secret, '1534228693017432124');
    expect(isLfgDmCustomId(raw)).toBe(true);
    expect(raw.length).toBeLessThanOrEqual(100);
    const parsed = parseLfgDmCustomId(raw, secret);
    expect(parsed.action).toBe('join');
    expect(parsed.param).toBe('1534228693017432124');
    expect(parsed.activityOpaqueId).toBe(activityOpaque);
  });

  it('rejects tampered signatures', () => {
    const raw = createLfgDmCustomId(activityOpaque, 'mute', secret, 'azrael');
    expect(() => parseLfgDmCustomId(`${raw}x`, secret)).toThrow();
  });
});
