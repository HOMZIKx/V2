import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Contract mirror of the Discord Gateway → Authorization member snapshot:
 * `v2UserId` must be rejected (Identity is the only link writer).
 */
const gatewayMemberSnapshotSchema = z
  .object({
    discordUserId: z.string().min(1).max(128),
    roleIds: z.array(z.string().min(1).max(128)).default([]),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .strict();

describe('Discord Gateway member snapshot contract', () => {
  it('accepts snapshots without v2UserId', () => {
    const parsed = gatewayMemberSnapshotSchema.parse({
      discordUserId: 'd1',
      roleIds: ['r1'],
      status: 'active',
    });
    expect(parsed).toEqual({ discordUserId: 'd1', roleIds: ['r1'], status: 'active' });
  });

  it('rejects gateway-injected v2UserId', () => {
    const result = gatewayMemberSnapshotSchema.safeParse({
      discordUserId: 'd1',
      v2UserId: 'attacker-v2',
      roleIds: [],
      status: 'active',
    });
    expect(result.success).toBe(false);
  });
});
