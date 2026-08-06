import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type { SessionRevokePort } from '../../application/ports/authorization.ports.js';
import { AuthorizationError } from '../../domain/errors.js';
import type { AuthorizationEnv } from '../config/authorization-env.js';

export interface SystemRevokeClientOptions {
  readonly clientId: string;
  readonly kid: string;
  readonly privateKeyPem: string;
  readonly revokeUrl: string;
  readonly maxTtlSeconds: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Signs an EdDSA client assertion as the Authorization system client and POSTs
 * a session revoke to Identity. Audience is the exact revoke URL.
 */
export class SystemRevokeClient implements SessionRevokePort {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: SystemRevokeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public static fromEnv(
    config: AuthorizationEnv,
    fetchImpl?: typeof fetch,
  ): SystemRevokeClient | null {
    if (
      config.AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM === undefined ||
      config.AUTHORIZATION_SYSTEM_ACTIVE_KID === undefined ||
      config.AUTHORIZATION_IDENTITY_REVOKE_URL === undefined
    ) {
      return null;
    }

    return new SystemRevokeClient({
      clientId: config.AUTHORIZATION_SYSTEM_CLIENT_ID,
      kid: config.AUTHORIZATION_SYSTEM_ACTIVE_KID,
      privateKeyPem: config.AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM,
      revokeUrl: config.AUTHORIZATION_IDENTITY_REVOKE_URL,
      maxTtlSeconds: config.AUTHORIZATION_IDENTITY_ASSERTION_MAX_TTL_SECONDS,
      ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    });
  }

  public async revokeAllSessionsForUser(
    v2UserId: string,
    correlationId: string,
    reason: string,
  ): Promise<void> {
    const assertion = await this.signAssertion();
    let response: Response;
    try {
      response = await this.fetchImpl(this.options.revokeUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'identity-client-assertion': assertion,
        },
        body: JSON.stringify({
          v2_user_id: v2UserId,
          reason,
          correlation_id: correlationId,
        }),
      });
    } catch {
      throw new AuthorizationError(
        'CONFIG_INVALID',
        'Failed to reach Identity session revoke endpoint',
      );
    }

    if (!response.ok) {
      throw new AuthorizationError(
        'CONFIG_INVALID',
        `Identity session revoke failed with status ${response.status}`,
      );
    }
  }

  private async signAssertion(): Promise<string> {
    const key = await importPKCS8(this.options.privateKeyPem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.options.kid })
      .setIssuer(this.options.clientId)
      .setSubject(this.options.clientId)
      .setAudience(this.options.revokeUrl)
      .setIssuedAt(now)
      .setExpirationTime(now + this.options.maxTtlSeconds)
      .sign(key);
  }
}
