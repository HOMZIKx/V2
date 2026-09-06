import { describe, expect, it } from 'vitest';

import {
  MATEUSZ_OPERATOR_DISCORD_ID,
  canAccessMemberActivityTechnik,
  readTechnikAccessFromConfig,
} from './technik-access.js';

describe('Technik access', () => {
  it('allows Mateusz operator id always', () => {
    expect(
      canAccessMemberActivityTechnik({
        viewerDiscordId: MATEUSZ_OPERATOR_DISCORD_ID,
        access: { adminRoleIds: [], operators: [] },
      }),
    ).toBe(true);
  });

  it('allows listed operator', () => {
    expect(
      canAccessMemberActivityTechnik({
        viewerDiscordId: '111111111111111111',
        access: {
          adminRoleIds: [],
          operators: [{ discordUserId: '111111111111111111', displayName: 'X' }],
        },
      }),
    ).toBe(true);
  });

  it('denies unknown viewer', () => {
    expect(
      canAccessMemberActivityTechnik({
        viewerDiscordId: '222222222222222222',
        access: { adminRoleIds: [], operators: [] },
      }),
    ).toBe(false);
  });

  it('reads technikAccess from config', () => {
    const a = readTechnikAccessFromConfig({
      technikAccess: {
        adminRoleIds: ['333333333333333333'],
        operators: [{ discordUserId: '444444444444444444', displayName: 'Op' }],
      },
    });
    expect(a.adminRoleIds).toEqual(['333333333333333333']);
    expect(a.operators[0]?.discordUserId).toBe('444444444444444444');
  });
});
