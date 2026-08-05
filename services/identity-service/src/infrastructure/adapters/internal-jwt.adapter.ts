import type {
  ClientAssertionPort,
  InternalJwtIssuePort,
} from '../../application/ports/internal-token.ports.js';
import type { IdentityEnv } from '../config/identity-env.js';
import {
  assertAudienceAllowedForClient,
  verifyClientAssertion,
} from '../internal-jwt/client-assertion-verifier.js';
import type { InternalJwtRuntime } from '../internal-jwt/create-internal-jwt-runtime.js';
import { signInternalJwt } from '../internal-jwt/internal-jwt-signer.js';

export class InternalJwtAdapter implements ClientAssertionPort, InternalJwtIssuePort {
  public constructor(
    private readonly runtime: InternalJwtRuntime,
    private readonly config: IdentityEnv,
  ) {}

  public verify(assertion: string): Promise<{ clientId: string; kid: string; jti: string }> {
    return verifyClientAssertion(assertion, this.config, this.runtime.serviceClients);
  }

  public assertJtiOnce(jti: string, ttlSeconds: number): Promise<void> {
    return this.runtime.assertionJtiStore.assertOnce(jti, ttlSeconds);
  }

  public assertAudienceAllowed(clientId: string, audience: string): void {
    assertAudienceAllowedForClient(this.runtime.serviceClients, clientId, audience);
  }

  public async issue(userId: string, audience: string) {
    const issued = await signInternalJwt(this.runtime.keyring, this.config, userId, audience);
    return {
      accessToken: issued.accessToken,
      tokenType: issued.tokenType,
      expiresInSeconds: issued.expiresInSeconds,
    };
  }

  public getJwks(): { readonly keys: readonly Record<string, unknown>[] } {
    return this.runtime.keyring.jwks;
  }
}

export function createInternalJwtAdapter(
  runtime: InternalJwtRuntime,
  config: IdentityEnv,
): InternalJwtAdapter {
  return new InternalJwtAdapter(runtime, config);
}
