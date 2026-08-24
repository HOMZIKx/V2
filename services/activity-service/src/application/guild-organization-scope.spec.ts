import { describe, expect, it } from 'vitest';

import { ActivityError } from '../domain/errors.js';
import {
  requireGuildOrganizationMatch,
  resolveGuildOrganizationId,
} from './guild-organization-scope.js';
import type { ActivityTx } from './ports/activity.ports.js';
import { stubGuildSettings } from './test-guild-settings.stub.js';

function txWithOrg(orgId: string | null): ActivityTx {
  return {
    getSettings: () => Promise.resolve(orgId === null ? null : stubGuildSettings({ orgId })),
  } as unknown as ActivityTx;
}

describe('guild-organization-scope', () => {
  it('allows bootstrap org when guild settings are missing', async () => {
    const tx = txWithOrg(null);
    await expect(resolveGuildOrganizationId(tx, 'g1', 'o-new')).resolves.toBe('o-new');
  });

  it('rejects mismatched org on resolve', async () => {
    const tx = txWithOrg('o1');
    await expect(resolveGuildOrganizationId(tx, 'g1', 'o2')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns canonical org when matched', async () => {
    const tx = txWithOrg('o1');
    await expect(resolveGuildOrganizationId(tx, 'g1', 'o1')).resolves.toBe('o1');
  });

  it('requireGuildOrganizationMatch rejects foreign org', async () => {
    const tx = txWithOrg('o1');
    await expect(requireGuildOrganizationMatch(tx, 'g1', 'o2')).rejects.toBeInstanceOf(
      ActivityError,
    );
  });

  it('requireGuildOrganizationMatch rejects missing guild settings', async () => {
    const tx = txWithOrg(null);
    await expect(requireGuildOrganizationMatch(tx, 'g1', 'o1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
