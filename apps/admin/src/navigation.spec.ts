import { describe, expect, it } from 'vitest';

import { ADMIN_NAV_SECTIONS, LEGACY_ACTIVITY_REDIRECTS, PULPIT_NAV } from './navigation.js';

describe('admin navigation', () => {
  it('exposes product-first sections without fake roadmap modules', () => {
    const titles = ADMIN_NAV_SECTIONS.map((section) => section.title);
    expect(titles).toEqual(['Discord Bot', 'Aktywności', 'System']);
    const labels = ADMIN_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.label));
    expect(labels).not.toContain('Player Toolkit');
    expect(labels).not.toContain('Guild Control');
  });

  it('keeps legacy activity redirects for bookmarks', () => {
    expect(LEGACY_ACTIVITY_REDIRECTS.some((entry) => entry.from === '/activity/channels')).toBe(
      true,
    );
    expect(PULPIT_NAV.to).toBe('/');
  });
});
