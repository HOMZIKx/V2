import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { IdentityError } from '../../domain/errors.js';
import type { IdentityEnv } from '../config/identity-env.js';

const authorizeDecisionSchema = z.object({
  decision: z.enum(['allow', 'deny']),
});

export interface AuthorizationClient {
  upsertIdentityLink(input: {
    readonly discordUserId: string;
    readonly v2UserId: string;
  }): Promise<void>;
  authorizeWwwLogin(input: {
    readonly discordUserId: string;
    readonly v2UserId: string;
  }): Promise<'allow' | 'deny'>;
}

/**
 * Signs short-lived Identity→Authz system assertions and calls Authorization HTTP APIs.
 */
export class HttpAuthorizationClient implements AuthorizationClient {
  public constructor(
    private readonly config: Pick<
      IdentityEnv,
      | 'IDENTITY_AUTHORIZATION_BASE_URL'
      | 'IDENTITY_AUTHORIZATION_ASSERTION_AUD'
      | 'IDENTITY_TO_AUTHZ_CLIENT_ID'
      | 'IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM'
      | 'IDENTITY_TO_AUTHZ_ACTIVE_KID'
      | 'IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS'
    >,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private requireConfig(): {
    baseUrl: string;
    audience: string;
    clientId: string;
    privatePem: string;
    kid: string;
  } {
    const baseUrl = this.config.IDENTITY_AUTHORIZATION_BASE_URL;
    const audience = this.config.IDENTITY_AUTHORIZATION_ASSERTION_AUD;
    const privatePem = this.config.IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM;
    const kid = this.config.IDENTITY_TO_AUTHZ_ACTIVE_KID;
    if (
      baseUrl === undefined ||
      audience === undefined ||
      privatePem === undefined ||
      kid === undefined
    ) {
      throw new IdentityError(
        'AUTHORIZATION_UNAVAILABLE',
        'Authorization client is not fully configured',
      );
    }
    return {
      baseUrl: baseUrl.replace(/\/$/, ''),
      audience,
      clientId: this.config.IDENTITY_TO_AUTHZ_CLIENT_ID,
      privatePem,
      kid,
    };
  }

  private async signAssertion(): Promise<string> {
    const { audience, clientId, privatePem, kid } = this.requireConfig();
    const key = await importPKCS8(privatePem, 'EdDSA');
    const ttl = this.config.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS;
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .setIssuer(clientId)
      .setSubject(clientId)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key);
  }

  private async postJson(path: string, body: unknown): Promise<Response> {
    const { baseUrl } = this.requireConfig();
    const assertion = await this.signAssertion();
    try {
      return await this.fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization-client-assertion': assertion,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new IdentityError('AUTHORIZATION_UNAVAILABLE', 'Authorization service is unreachable');
    }
  }

  public async upsertIdentityLink(input: {
    readonly discordUserId: string;
    readonly v2UserId: string;
  }): Promise<void> {
    const response = await this.postJson('/authorization/v1/identity-links', {
      discordUserId: input.discordUserId,
      v2UserId: input.v2UserId,
    });

    if (!response.ok) {
      throw new IdentityError(
        'AUTHORIZATION_UNAVAILABLE',
        `Identity link upsert failed (${String(response.status)})`,
      );
    }
  }

  public async authorizeWwwLogin(input: {
    readonly discordUserId: string;
    readonly v2UserId: string;
  }): Promise<'allow' | 'deny'> {
    const response = await this.postJson('/authorization/v1/authorize', {
      subject: {
        discordUserId: input.discordUserId,
        v2UserId: input.v2UserId,
      },
      permissionId: 'permission.platform.login.www',
      scope: { type: 'organization' },
      operationClass: 'sensitive',
    });

    if (!response.ok) {
      throw new IdentityError(
        'AUTHORIZATION_UNAVAILABLE',
        `Authorize call failed (${String(response.status)})`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new IdentityError('AUTHORIZATION_UNAVAILABLE', 'Authorize response was not valid JSON');
    }

    const parsed = authorizeDecisionSchema.safeParse(json);
    if (!parsed.success) {
      throw new IdentityError('AUTHORIZATION_UNAVAILABLE', 'Authorize response missing decision');
    }
    return parsed.data.decision;
  }
}

export function createAuthorizationClient(config: IdentityEnv): AuthorizationClient {
  return new HttpAuthorizationClient(config);
}
