import { IdentityError } from '../../domain/errors.js';
import type { IdentitySessionPort } from '../ports/identity.ports.js';
import type { ClientAssertionPort } from '../ports/internal-token.ports.js';

export interface SystemRevokeSessionsInput {
  readonly clientAssertion: string | undefined;
  readonly expectedAudience: string;
  readonly assertionReplayTtlSeconds: number;
  readonly v2UserId: string;
  readonly reason: string;
  readonly correlationId: string;
}

/**
 * System revoke: service-assertion only (no user cookie / internal JWT).
 * Verifies the caller assertion, enforces jti single-use, then revokes every
 * session for the target V2 user.
 */
export async function revokeSessionsForUserSystem(
  sessionPort: IdentitySessionPort,
  assertionPort: ClientAssertionPort,
  input: SystemRevokeSessionsInput,
): Promise<{ status: 'ok'; revoked_user_id: string; correlation_id: string }> {
  if (input.clientAssertion === undefined || input.clientAssertion.length === 0) {
    throw new IdentityError('CLIENT_ASSERTION_INVALID', 'Missing Identity-Client-Assertion header');
  }

  const assertion = await assertionPort.verify(input.clientAssertion, input.expectedAudience);
  await assertionPort.assertJtiOnce(assertion.jti, input.assertionReplayTtlSeconds);

  await sessionPort.revokeAllSessionsForUser(input.v2UserId);

  return {
    status: 'ok',
    revoked_user_id: input.v2UserId,
    correlation_id: input.correlationId,
  };
}
