import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type {
  AuthorizePort,
  AuthorizeRequest,
  AuthorizeResult,
} from '../../application/ports/activity.ports.js';
import { ActivityError } from '../../domain/errors.js';
import { isProjectionCentrumMode, type ActivityEnv } from '../config/activity-env.js';

export interface HttpAuthorizationClientOptions {
  readonly baseUrl: string;
  readonly assertionAud: string;
  readonly clientId: string;
  readonly kid: string;
  readonly privateKeyPem: string;
  readonly maxTtlSeconds: number;
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * S2S Authorization client. Signs EdDSA client assertions and POSTs
 * `/authorization/v1/authorize`. Activity never evaluates RBAC locally.
 */
export class HttpAuthorizationClient implements AuthorizePort {
  private readonly fetchImpl: typeof globalThis.fetch;

  public constructor(private readonly options: HttpAuthorizationClientOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public static fromEnv(
    config: ActivityEnv,
    fetchImpl?: typeof globalThis.fetch,
  ): HttpAuthorizationClient | null {
    if (
      config.ACTIVITY_AUTHORIZATION_BASE_URL === undefined ||
      config.ACTIVITY_AUTHORIZATION_ASSERTION_AUD === undefined ||
      config.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM === undefined ||
      config.ACTIVITY_TO_AUTHZ_ACTIVE_KID === undefined
    ) {
      return null;
    }

    return new HttpAuthorizationClient({
      baseUrl: config.ACTIVITY_AUTHORIZATION_BASE_URL.replace(/\/$/, ''),
      assertionAud: config.ACTIVITY_AUTHORIZATION_ASSERTION_AUD,
      clientId: config.ACTIVITY_TO_AUTHZ_CLIENT_ID,
      kid: config.ACTIVITY_TO_AUTHZ_ACTIVE_KID,
      privateKeyPem: config.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM,
      maxTtlSeconds: config.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    });
  }

  public async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    const assertion = await this.signAssertion();
    const url = `${this.options.baseUrl}/authorization/v1/authorize`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization-client-assertion': assertion,
        },
        body: JSON.stringify({
          subject: request.subject,
          permissionId: request.permissionId,
          scope: request.scope,
          operationClass: request.operationClass ?? 'ordinary',
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ActivityError(
        'AUTHORIZATION_UNAVAILABLE',
        'Failed to reach Authorization authorize endpoint',
      );
    }

    if (!response.ok) {
      throw new ActivityError(
        'AUTHORIZATION_UNAVAILABLE',
        `Authorization authorize failed with status ${response.status}`,
      );
    }

    let body: { decision?: unknown };
    try {
      body = (await response.json()) as { decision?: unknown };
    } catch {
      throw new ActivityError('AUTHORIZATION_UNAVAILABLE', 'Authorization returned invalid JSON');
    }

    const allowed = body.decision === 'allow';
    return {
      allowed,
      permissionId: request.permissionId,
      decision: allowed ? 'allow' : 'deny',
    };
  }

  private async signAssertion(): Promise<string> {
    const key = await importPKCS8(this.options.privateKeyPem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.options.kid })
      .setIssuer(this.options.clientId)
      .setSubject(this.options.clientId)
      .setAudience(this.options.assertionAud)
      .setIssuedAt(now)
      .setExpirationTime(now + this.options.maxTtlSeconds)
      .sign(key);
  }
}

/** Allow-all stub used when ACTIVITY_ENABLED=false in local / test environments. */
export class AllowAllAuthorizationClient implements AuthorizePort {
  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return Promise.resolve({
      allowed: true,
      permissionId: request.permissionId,
      decision: 'allow',
    });
  }
}

/** Production fail-closed stub when ACTIVITY_ENABLED=false. Never implicit allow. */
export class DenyAllAuthorizationClient implements AuthorizePort {
  public authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return Promise.resolve({
      allowed: false,
      permissionId: request.permissionId,
      decision: 'deny',
    });
  }
}

export function createAuthorizePort(
  config: ActivityEnv,
  fetchImpl?: typeof globalThis.fetch,
): AuthorizePort {
  if (!config.ACTIVITY_ENABLED) {
    if (config.NODE_ENV === 'production' && isProjectionCentrumMode(config)) {
      return new AllowAllAuthorizationClient();
    }
    const authzClient = HttpAuthorizationClient.fromEnv(config, fetchImpl);
    if (authzClient !== null) {
      return authzClient;
    }
    if (config.NODE_ENV === 'production') {
      return new DenyAllAuthorizationClient();
    }
    return new AllowAllAuthorizationClient();
  }
  const client = HttpAuthorizationClient.fromEnv(config, fetchImpl);
  if (client === null) {
    throw new Error('Authorization client could not be constructed while ACTIVITY_ENABLED=true');
  }
  return client;
}
