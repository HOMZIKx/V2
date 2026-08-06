import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthorizationStorePort,
  SessionRevokePort,
} from '../application/ports/authorization.ports.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import { AuthorizationMaintenanceWorker } from './authorization-maintenance.worker.js';

describe('AuthorizationMaintenanceWorker', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('runs expiry + revoke delivery on demand without a Discord/policy event', async () => {
    const processExpiredPolicies = vi.fn().mockResolvedValue({ revokedUserIds: [] });
    const claimPendingSessionRevokes = vi.fn().mockResolvedValue([
      {
        id: 'r1',
        v2UserId: 'u1',
        correlationId: 'c1',
        reason: 'login_entitlement_lost',
        attempts: 0,
      },
    ]);
    const markSessionRevokeDelivered = vi.fn().mockResolvedValue(true);
    const store = {
      processExpiredPolicies,
      claimPendingSessionRevokes,
      markSessionRevokeDelivered,
      listPendingSessionRevokes: vi.fn(),
      markSessionRevokeAttemptFailed: vi.fn(),
    } as unknown as AuthorizationStorePort;
    const revokeAllSessionsForUser = vi.fn().mockResolvedValue(undefined);
    const revoke: SessionRevokePort = { revokeAllSessionsForUser };

    const worker = new AuthorizationMaintenanceWorker(
      {
        AUTHORIZATION_ENABLED: true,
        AUTHORIZATION_MAINTENANCE_INTERVAL_MS: 0,
        AUTHORIZATION_REVOKE_BATCH_LIMIT: 10,
        AUTHORIZATION_REVOKE_LEASE_SECONDS: 30,
        AUTHORIZATION_REVOKE_MAX_ATTEMPTS: 25,
      } as AuthorizationEnv,
      store,
      revoke,
    );

    await worker.runOnce();

    expect(processExpiredPolicies).toHaveBeenCalled();
    expect(claimPendingSessionRevokes).toHaveBeenCalledTimes(1);
    const claimArg = claimPendingSessionRevokes.mock.calls[0]?.[0] as {
      leaseOwner: string;
      leaseSeconds: number;
      limit: number;
    };
    expect(typeof claimArg.leaseOwner).toBe('string');
    expect(claimArg.leaseSeconds).toBe(30);
    expect(claimArg.limit).toBe(10);
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith('u1', 'c1', 'login_entitlement_lost');
    expect(markSessionRevokeDelivered).toHaveBeenCalled();
  });
});
