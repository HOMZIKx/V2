import { verifyInternalJwt } from '@v2/internal-jwt';
import type { JWK } from 'jose';

import { buildClientAssertion } from './build-client-assertion.js';
import type { InternalJwtClientEnv } from './internal-jwt-client-env.js';

export interface InternalJwtProofResult {
  readonly ok: true;
  readonly sub: string;
}

export class InternalJwtProofService {
  public constructor(
    private readonly config: InternalJwtClientEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public async proveIssueAndVerify(sessionCookieHeader: string): Promise<InternalJwtProofResult> {
    if (!this.config.INTERNAL_JWT_CLIENT_ENABLED) {
      throw new Error('Internal JWT client is disabled');
    }

    const assertion = await buildClientAssertion(this.config);
    const identityBase = this.config.INTERNAL_JWT_IDENTITY_BASE_URL;
    const audience = this.config.INTERNAL_JWT_DEFAULT_AUDIENCE;
    const jwksUrl = this.config.INTERNAL_JWT_JWKS_URL;
    const issuer = this.config.INTERNAL_JWT_ISSUER;

    if (
      identityBase === undefined ||
      audience === undefined ||
      jwksUrl === undefined ||
      issuer === undefined
    ) {
      throw new Error('Internal JWT client is not fully configured');
    }

    const response = await this.fetchImpl(`${identityBase}/identity/internal-token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookieHeader,
        'identity-client-assertion': assertion,
      },
      body: JSON.stringify({ audience }),
    });

    if (!response.ok) {
      throw new Error(`Identity internal-token failed with status ${response.status}`);
    }

    const body = (await response.json()) as { access_token: string };
    const jwksResponse = await this.fetchImpl(jwksUrl);
    if (!jwksResponse.ok) {
      throw new Error(`JWKS fetch failed with status ${jwksResponse.status}`);
    }

    const jwks = (await jwksResponse.json()) as { keys: JWK[] };
    const verified = await verifyInternalJwt({
      token: body.access_token,
      expectedIssuer: issuer,
      expectedAudience: audience,
      jwks,
    });

    return { ok: true, sub: verified.sub };
  }
}
