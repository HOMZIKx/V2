import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import type { IdentityProfile } from '../../infrastructure/identity/identity-http-client.js';
import {
  applyProfileCharacter,
  buildLfgSearchBody,
  deriveTimeWindow,
  isWizardReady,
  mapSearchMatches,
  renderLfgHubEphemeral,
  resolveActiveCharacter,
  toggleSessionRole,
} from './lfg-hub-ephemeral.js';
import { createDefaultLfgWizardState } from './lfg-ui-state-cache.js';

const secret = 's'.repeat(32);
const opaquePanel = 'a1b2c3d4e5f6';

describe('lfg-hub-ephemeral', () => {
  it('renders wizard with dungeon select and ephemeral Components V2 flags', () => {
    const view = renderLfgHubEphemeral({
      opaquePanelId: opaquePanel,
      signingSecret: secret,
      state: createDefaultLfgWizardState(),
      profile: null,
    });
    expect(view.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    expect(view.components).toHaveLength(1);
  });

  it('resolves default character from profile', () => {
    const profile = {
      userId: 'u1',
      displayName: 'Mate',
      activeCharacterId: 'char-2',
      characters: [
        {
          id: 'char-1',
          nickname: 'Main',
          classSpecKey: 'warrior_body',
          partyRoles: ['TANK', 'DPS'] as ('TANK' | 'DPS')[],
          isDefault: false,
        },
        {
          id: 'char-2',
          nickname: 'Alt',
          classSpecKey: 'shaman_heal',
          partyRoles: ['BUFF', 'FLEX'] as ('BUFF' | 'FLEX')[],
          isDefault: true,
        },
      ],
      interestKeys: [],
    } satisfies IdentityProfile;
    expect(resolveActiveCharacter(profile)?.id).toBe('char-2');
    const state = applyProfileCharacter(createDefaultLfgWizardState(), profile);
    expect(state.characterId).toBe('char-2');
    expect(state.sessionRoles).toEqual(['BUFF', 'FLEX']);
  });

  it('toggles session roles without dropping below one role', () => {
    let state = applyProfileCharacter(createDefaultLfgWizardState(), {
      userId: 'u1',
      displayName: null,
      activeCharacterId: 'c1',
      characters: [
        {
          id: 'c1',
          nickname: 'X',
          classSpecKey: 'warrior_body',
          partyRoles: ['TANK', 'DPS'] as const,
          isDefault: true,
        },
      ],
      interestKeys: [],
    });
    state = toggleSessionRole(state, 'TANK');
    expect(state.sessionRoles).toEqual(['DPS']);
    state = toggleSessionRole(state, 'DPS');
    expect(state.sessionRoles).toEqual(['DPS']);
  });

  it('defaults session roles to all supported roles when selecting a character', () => {
    const profile = {
      userId: 'u1',
      displayName: null,
      activeCharacterId: 'char-a',
      characters: [
        {
          id: 'char-a',
          nickname: 'KuzynBuff',
          classSpecKey: 'shaman_dragon',
          classSpecLabel: 'Szaman Smok',
          partyRoles: ['BUFF', 'DPS'] as ('BUFF' | 'DPS')[],
          isDefault: true,
        },
      ],
      interestKeys: [],
    } satisfies IdentityProfile;
    let state = applyProfileCharacter(createDefaultLfgWizardState(), profile, 'char-a');
    expect(state.characterId).toBe('char-a');
    expect(state.classSpecLabel).toBe('Szaman Smok');
    expect(state.sessionRoles).toEqual(['BUFF', 'DPS']);
    expect(isWizardReady({ ...state, dungeonKey: 'azrael', timePreset: 'evening' })).toBe(true);

    state = toggleSessionRole(state, 'DPS');
    expect(state.sessionRoles).toEqual(['BUFF']);
  });

  it('after quick-create state, selecting new character resets session roles to supported set', () => {
    const before = {
      ...createDefaultLfgWizardState(),
      characterId: 'old',
      sessionRoles: ['TANK'] as 'TANK'[],
      characterSupportedRoles: ['TANK', 'DPS'] as ('TANK' | 'DPS')[],
    };
    const profile = {
      userId: 'u1',
      displayName: null,
      activeCharacterId: 'new',
      characters: [
        {
          id: 'new',
          nickname: 'Pasek',
          classSpecKey: 'warrior_body',
          classSpecLabel: 'Wojownik Ciało',
          partyRoles: ['DPS'] as 'DPS'[],
          isDefault: true,
        },
      ],
      interestKeys: [],
    } satisfies IdentityProfile;
    const state = applyProfileCharacter(before, profile, 'new');
    expect(state.characterId).toBe('new');
    expect(state.sessionRoles).toEqual(['DPS']);
    expect(state.pendingQuickAdd).toBeNull();
  });

  it('add_character screen lists only enabled Polish professions', () => {
    const view = renderLfgHubEphemeral({
      opaquePanelId: opaquePanel,
      signingSecret: secret,
      state: { ...createDefaultLfgWizardState(), screen: 'add_character' },
      profile: null,
    });
    const serialized = JSON.stringify(view.components);
    expect(serialized).toContain('Dodaj postać');
    expect(serialized).toContain('Wojownik Ciało');
    expect(serialized).toContain('Szaman Leczenie');
    expect(serialized).not.toContain('Lycan');
    expect(serialized).not.toContain('Likan');
    expect(serialized).not.toContain('Wojownik Body');
  });

  it('main wizard is a summary without permanent profession dropdown', () => {
    const view = renderLfgHubEphemeral({
      opaquePanelId: opaquePanel,
      signingSecret: secret,
      state: {
        ...createDefaultLfgWizardState(),
        dungeonKey: 'azrael',
        characterId: 'c1',
        characterLabel: 'KuzynBuff',
        classSpecKey: 'shaman_dragon',
        classSpecLabel: 'Szaman Smok',
        characterSupportedRoles: ['BUFF', 'DPS'],
        sessionRoles: ['BUFF'],
        timePreset: 'evening',
      },
      profile: {
        userId: 'u1',
        displayName: null,
        activeCharacterId: 'c1',
        characters: [
          {
            id: 'c1',
            nickname: 'KuzynBuff',
            classSpecKey: 'shaman_dragon',
            classSpecLabel: 'Szaman Smok',
            partyRoles: ['BUFF', 'DPS'],
            isDefault: true,
          },
        ],
        interestKeys: [],
      },
    });
    const serialized = JSON.stringify(view.components);
    expect(serialized).toContain('Szukam ekipy');
    expect(serialized).toContain('Znajdź ekipę');
    expect(serialized).toContain('Zmień loch');
    expect(serialized).toContain('KuzynBuff · Szaman Smok');
    expect(serialized).not.toContain('Szybkie dodanie postaci');
  });

  it('builds search body when wizard is complete', () => {
    const state = {
      ...createDefaultLfgWizardState(),
      dungeonKey: 'azrael',
      characterId: 'c1',
      characterLabel: 'Main',
      classSpecKey: 'warrior_body',
      classSpecLabel: 'Wojownik Ciało',
      characterSupportedRoles: ['TANK', 'DPS'] as const,
      sessionRoles: ['TANK'] as const,
      timePreset: 'now' as const,
    };
    expect(isWizardReady(state)).toBe(true);
    const body = buildLfgSearchBody({
      guildId: 'g1',
      organizationId: 'org1',
      state,
    });
    expect(body).toMatchObject({
      guildId: 'g1',
      organizationId: 'org1',
      activityTypeKey: 'azrael',
      characterId: 'c1',
      sessionRoles: ['TANK'],
    });
  });

  it('maps search matches with Polish-friendly labels', () => {
    const mapped = mapSearchMatches(
      [
        {
          activityId: '11111111-2222-3333-4444-555555555555',
          opaqueId: '111111222333',
          reasons: ['exact_role'],
          occupancyLabel: '3/8',
          roleNeedSummary: 'Potrzeba: 1 × TANK',
          startAt: '2026-08-22T16:00:00.000Z',
        },
      ],
      'Azrael',
    );
    expect(mapped[0]?.dungeonLabel).toBe('Azrael');
    expect(mapped[0]?.occupancyLabel).toBe('3/8');
    expect(mapped[0]?.matchReason.length).toBeGreaterThan(0);
  });

  it('derives time windows for presets', () => {
    const now = new Date('2026-08-22T10:00:00.000Z');
    const evening = deriveTimeWindow('evening', now);
    expect(evening.windowEndAt.getTime()).toBeGreaterThan(evening.windowStartAt.getTime());
  });
});
