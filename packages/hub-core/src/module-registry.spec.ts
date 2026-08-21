import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HUB_MODULES,
  getHubModule,
  isHubModuleInteractive,
  listHubModulesForSelect,
} from './module-registry.js';

describe('hub module registry', () => {
  it('covers Accepted IA map groups', () => {
    const groups = new Set(DEFAULT_HUB_MODULES.map((module) => module.group));
    expect([...groups].sort()).toEqual(['GILDIA', 'GRA', 'RYNEK', 'TY']);
  });

  it('marks activities available and profile as foundation', () => {
    expect(getHubModule('activities').availability).toBe('available');
    expect(getHubModule('profile').availability).toBe('foundation');
    expect(getHubModule('reservations').availability).toBe('roadmap');
  });

  it('lists non-disabled modules for Discord select', () => {
    expect(listHubModulesForSelect()).toHaveLength(DEFAULT_HUB_MODULES.length);
    expect(isHubModuleInteractive('available')).toBe(true);
    expect(isHubModuleInteractive('roadmap')).toBe(false);
  });
});
