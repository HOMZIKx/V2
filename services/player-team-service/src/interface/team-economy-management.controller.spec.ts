import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { TeamEconomyDropManagementRepository } from '../infrastructure/db/team-economy-drop-management.repository.js';
import { TeamEconomyManagementRepository } from '../infrastructure/db/team-economy-management.repository.js';
import { TeamEconomyManagementController } from './team-economy-management.controller.js';

const SELF_DECLARED_DEPS_METADATA = 'self:paramtypes';

type ExplicitDependency = {
  readonly index: number;
  readonly param: unknown;
};

describe('TeamEconomyManagementController dependency injection', () => {
  it('declares the repository tokens explicitly for the tsx runtime', () => {
    const dependencies =
      (Reflect.getMetadata(
        SELF_DECLARED_DEPS_METADATA,
        TeamEconomyManagementController,
      ) as ExplicitDependency[] | undefined) ?? [];

    expect(dependencies).toEqual(
      expect.arrayContaining([
        { index: 0, param: TeamEconomyManagementRepository },
        { index: 1, param: TeamEconomyDropManagementRepository },
      ]),
    );
  });
});
