import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TECHNIK_ACCESS,
  MATEUSZ_OPERATOR_DISCORD_ID,
  MATEUSZ_OPERATOR_ENTRY,
  canAccessMemberActivityTechnik,
  ensureMateuszOperator,
  readTechnikAccessFromConfig,
  resolveViewerDiscordId,
} from './technik-access.js';

describe('Technik access', () => {
  it('DEFAULT_TECHNIK_ACCESS always includes Mateusz', () => {
    expect(DEFAULT_TECHNIK_ACCESS.operators).toEqual([
      expect.objectContaining({
        discordUserId: MATEUSZ_OPERATOR_DISCORD_ID,
        displayName: 'Mateusz',
      }),
    ]);
  });

  it('allows Mateusz operator id always', () => {
    expect(
      canAccessMemberActivityTechnik({
        viewerDiscordId: MATEUSZ_OPERATOR_DISCORD_ID,
        access: { adminRoleIds: [], operators: [] },
      }),
    ).toBe(true);
  });

  it('allows seeded demo owner id mateusz without discordAccountId', () => {
    expect(
      canAccessMemberActivityTechnik({
        viewerDiscordId: '',
        viewer: { id: 'mateusz', displayName: 'Mateusz' },
        access: { adminRoleIds: [], operators: [] },
      }),
    ).toBe(true);
  });

  it('resolves snowflake from viewer.id when discordAccountId missing', () => {
    expect(resolveViewerDiscordId({ id: MATEUSZ_OPERATOR_DISCORD_ID, displayName: 'M' })).toBe(
      MATEUSZ_OPERATOR_DISCORD_ID,
    );
    expect(
      canAccessMemberActivityTechnik({
        viewerDiscordId: '',
        viewer: { id: MATEUSZ_OPERATOR_DISCORD_ID, displayName: 'Mateusz' },
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
        viewer: { id: 'other', displayName: 'Other' },
        access: { adminRoleIds: [], operators: [] },
      }),
    ).toBe(false);
  });

  it('reads technikAccess from config and always seeds Mateusz', () => {
    const a = readTechnikAccessFromConfig({
      technikAccess: {
        adminRoleIds: ['333333333333333333'],
        operators: [{ discordUserId: '444444444444444444', displayName: 'Op' }],
      },
    });
    expect(a.adminRoleIds).toEqual(['333333333333333333']);
    expect(a.operators[0]).toEqual(MATEUSZ_OPERATOR_ENTRY);
    expect(a.operators.some((o) => o.discordUserId === '444444444444444444')).toBe(true);
  });

  it('seeds Mateusz even when config omits operators', () => {
    const a = readTechnikAccessFromConfig({ technikAccess: { adminRoleIds: [] } });
    expect(a.operators).toEqual([MATEUSZ_OPERATOR_ENTRY]);
  });

  it('ensureMateuszOperator dedupes and keeps Mateusz first', () => {
    const out = ensureMateuszOperator([
      { discordUserId: MATEUSZ_OPERATOR_DISCORD_ID, displayName: 'Old' },
      { discordUserId: '555555555555555555', displayName: 'X' },
    ]);
    expect(out[0]).toEqual(MATEUSZ_OPERATOR_ENTRY);
    expect(out.filter((o) => o.discordUserId === MATEUSZ_OPERATOR_DISCORD_ID)).toHaveLength(1);
    expect(out[1]?.discordUserId).toBe('555555555555555555');
  });
});
