import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CLASS_SPEC_CATALOG,
  DEFAULT_HUB_MODULES,
  DEFAULT_PARTY_ROLE_CATALOG,
  FORBIDDEN_PLAYER_CLASS_SPEC_LABELS,
  PLAYER_FACING_CLASS_SPEC_LABELS,
  getHubModule,
  isHubModuleInteractive,
  listEnabledClassSpecs,
  listHubCentrumSelectOptions,
  listHubModulesForSelect,
  listRoadmapModuleLabels,
} from './index.js';

describe('hub module registry — Owner Centrum UX', () => {
  it('lists only interactive modules for legacy select helper', () => {
    const listed = listHubModulesForSelect();
    expect(listed.every((module) => isHubModuleInteractive(module.availability))).toBe(true);
    expect(listed.some((module) => module.availability === 'roadmap')).toBe(false);
  });

  it('exposes direct Centrum actions without Aktywności submenu', () => {
    const options = listHubCentrumSelectOptions();
    const values = options.map((option) => option.value);
    expect(values).toEqual(['create', 'lfg', 'mine', 'for_me', 'profile', 'notifications']);
    expect(values).not.toContain('activities');
    expect(values).not.toContain('reservations');
    expect(values).not.toContain('community');
  });

  it('keeps roadmap labels passive only', () => {
    expect(listRoadmapModuleLabels()).toEqual(
      expect.arrayContaining(['Rezerwacje', 'Handel', 'Wsparcie', 'Społeczność']),
    );
    expect(getHubModule('reservations').availability).toBe('roadmap');
    expect(DEFAULT_HUB_MODULES.filter((m) => m.availability === 'roadmap').length).toBe(4);
  });
});

describe('class/spec catalog — Polish player labels', () => {
  it('exposes exactly the Owner profession set as selectable', () => {
    const labels = listEnabledClassSpecs().map((entry) => entry.label);
    expect(labels).toEqual([...PLAYER_FACING_CLASS_SPEC_LABELS]);
  });

  it('does not offer Lycan/Likan or English profession fragments as selectable', () => {
    const labels = listEnabledClassSpecs().map((entry) => entry.label);
    for (const forbidden of FORBIDDEN_PLAYER_CLASS_SPEC_LABELS) {
      expect(labels).not.toContain(forbidden);
    }
    expect(DEFAULT_CLASS_SPEC_CATALOG.find((entry) => entry.key === 'lycan')?.enabled).toBe(false);
  });
});

describe('party role catalog — Dowolna', () => {
  it('labels FLEX as Dowolna for players', () => {
    expect(DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === 'FLEX')?.label).toBe('Dowolna');
    expect(DEFAULT_PARTY_ROLE_CATALOG.some((entry) => entry.label.includes('Any'))).toBe(false);
    expect(DEFAULT_PARTY_ROLE_CATALOG.some((entry) => entry.label === 'Flex')).toBe(false);
  });
});
