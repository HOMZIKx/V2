import { IdentityError } from '../../domain/errors.js';
import type { IdentitySessionPort } from '../ports/identity.ports.js';
import type {
  ClientAssertionPort,
  InternalJwtIssuePort,
  InternalTokenView,
} from '../ports/internal-token.ports.js';

export interface IssueInternalTokenInput {
  readonly clientAssertion: string;
  readonly userSessionHeaders: Headers;
  readonly audience: string;
  /** Exact assertion audience (IDENTITY_INTERNAL_JWT_ISSUE_URL). */
  readonly expectedAudience: string;
  readonly assertionReplayTtlSeconds: number;
}

export async function issueInternalToken(
  sessionPort: IdentitySessionPort,
  assertionPort: ClientAssertionPort,
  issuePort: InternalJwtIssuePort,
  input: IssueInternalTokenInput,
): Promise<InternalTokenView> {
  const assertion = await assertionPort.verify(input.clientAssertion, input.expectedAudience);
  await assertionPort.assertJtiOnce(assertion.jti, input.assertionReplayTtlSeconds);
  assertionPort.assertAudienceAllowed(assertion.clientId, input.audience);

  const user = await sessionPort.getMe(input.userSessionHeaders);
  if (user === null) {
    throw new IdentityError('UNAUTHENTICATED');
  }

  return issuePort.issue(user.id, input.audience);
}
