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

  it('builds search body when wizard is complete', () => {
    const state = {
      ...createDefaultLfgWizardState(),
      dungeonKey: 'azrael',
      characterId: 'c1',
      characterLabel: 'Main',
      classSpecKey: 'warrior_body',
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
      characterClassSpecKey: 'warrior_body',
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
