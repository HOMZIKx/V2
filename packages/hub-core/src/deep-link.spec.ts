import { describe, expect, it } from 'vitest';

import { formatDeepLink, parseDeepLink, wwwPathForDeepLink } from './deep-link.js';

describe('deep-link', () => {
  it('round-trips durable V2 identity', () => {
    const link = formatDeepLink({
      module: 'activities',
      objectId: 'abc-123',
      action: 'open',
    });
    expect(link).toBe('v2://activities/abc-123?action=open');
    expect(parseDeepLink(link)).toEqual({
      module: 'activities',
      objectId: 'abc-123',
      action: 'open',
    });
    expect(wwwPathForDeepLink(parseDeepLink(link))).toBe('/aktywnosci/abc-123');
  });

  it('rejects Discord message URLs as identity', () => {
    expect(() => parseDeepLink('https://discord.com/channels/1/2/3')).toThrow(/v2:\/\//);
  });
});
