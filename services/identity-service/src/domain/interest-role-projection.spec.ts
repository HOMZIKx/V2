import { describe, expect, it } from 'vitest';

import {
  computeInterestRoleProjection,
  validateInterestRoleMappingSafety,
} from './interest-role-projection.js';

describe('interest-role-projection', () => {
  it('rejects privileged and hierarchy-unsafe roles', () => {
    expect(
      validateInterestRoleMappingSafety({
        everyoneRoleId: '1',
        botHighestPosition: 10,
        role: {
          id: '2',
          name: 'Admin',
          managed: false,
          position: 5,
          permissionsBitfield: 1n << 3n,
        },
      }).ok,
    ).toBe(false);
  });

  it('computes assign/remove idempotently', () => {
    const actions = computeInterestRoleProjection({
      userInterestKeys: ['azrael'],
      mappings: [
        { interestKey: 'azrael', discordRoleId: 'r-az', enabled: true },
        { interestKey: 'smok', discordRoleId: 'r-sm', enabled: true },
      ],
      currentlyHeldRoleIds: new Set(['r-sm']),
    });
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'assign', discordRoleId: 'r-az' }),
        expect.objectContaining({ action: 'remove', discordRoleId: 'r-sm' }),
      ]),
    );
  });
});
