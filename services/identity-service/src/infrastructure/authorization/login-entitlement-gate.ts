import { APIError } from 'better-auth';
import type { Pool } from 'pg';

import { IdentityError } from '../../domain/errors.js';
import type { AuthorizationClient } from './authorization-client.js';

/**
 * Look up the Discord provider account id for a V2 user from Better Auth's
 * account table. Returns null when no Discord link exists yet.
 */
export async function findDiscordAccountId(
  pool: Pool,
  userId: string,
): Promise<string | null> {
  const result = await pool.query<{ accountId: string }>(
    `SELECT "accountId" FROM "account" WHERE "userId" = $1 AND "providerId" = 'discord' LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.accountId ?? null;
}

/**
 * P3-D19: before a full WWW session is persisted, link Discord↔V2 in Authz and
 * require permission.platform.login.www (sensitive). Fail-closed on Authz errors.
 * The V2 user row is left intact on deny (caller runs after user create).
 */
export async function enforceLoginEntitlement(options: {
  readonly pool: Pool;
  readonly authorizationClient: AuthorizationClient;
  readonly userId: string;
}): Promise<void> {
  const discordUserId = await findDiscordAccountId(options.pool, options.userId);
  if (discordUserId === null) {
    throw new APIError('FORBIDDEN', {
      message: 'Login requires a linked Discord identity',
      code: 'LOGIN_NOT_ENTITLED',
    });
  }

  try {
    await options.authorizationClient.upsertIdentityLink({
      discordUserId,
      v2UserId: options.userId,
    });

    const decision = await options.authorizationClient.authorizeWwwLogin({
      discordUserId,
      v2UserId: options.userId,
    });

    if (decision !== 'allow') {
      throw new APIError('FORBIDDEN', {
        message: 'Login is not entitled for this Discord membership',
        code: 'LOGIN_NOT_ENTITLED',
      });
    }
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    if (error instanceof IdentityError && error.code === 'AUTHORIZATION_UNAVAILABLE') {
      throw new APIError('SERVICE_UNAVAILABLE', {
        message: 'Authorization service unavailable',
        code: 'AUTHORIZATION_UNAVAILABLE',
      });
    }
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: 'Authorization check failed',
      code: 'AUTHORIZATION_UNAVAILABLE',
    });
  }
}
