import { describe, expect, it } from 'vitest';

import { wwwPathForDeepLink } from './deep-link.js';

describe('profile deep links', () => {
  it('routes characters management to /profil/postacie', () => {
    expect(wwwPathForDeepLink({ module: 'profile', objectId: 'me', action: 'characters' })).toBe(
      '/profil/postacie',
    );
  });
});
