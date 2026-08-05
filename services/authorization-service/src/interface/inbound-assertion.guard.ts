import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AuthorizationError } from '../domain/errors.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import {
  type AssertionJtiStore,
  type InboundClientRegistry,
  verifyInboundAssertion,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import {
  ASSERTION_JTI_STORE,
  AUTHORIZATION_CONFIG,
  INBOUND_CLIENT_REGISTRY,
} from './authorization.tokens.js';

const ASSERTION_HEADER = 'authorization-client-assertion';

/**
 * When `AUTHORIZATION_ENABLED=false`, inbound assertions are skipped so local
 * tests can exercise HTTP without key material. When enabled, every guarded
 * route requires a valid `Authorization-Client-Assertion` header.
 */
@Injectable()
export class InboundAssertionGuard implements CanActivate {
  public constructor(
    @Inject(AUTHORIZATION_CONFIG) private readonly config: AuthorizationEnv,
    @Inject(INBOUND_CLIENT_REGISTRY)
    private readonly registry: InboundClientRegistry | null,
    @Inject(ASSERTION_JTI_STORE) private readonly jtiStore: AssertionJtiStore | null,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.AUTHORIZATION_ENABLED) {
      return true;
    }

    if (this.registry === null) {
      throw new AuthorizationError(
        'CONFIG_INVALID',
        'Inbound client registry is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers[ASSERTION_HEADER];
    const assertion =
      typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;

    if (assertion === undefined || assertion.length === 0) {
      throw new AuthorizationError(
        'CLIENT_ASSERTION_INVALID',
        'Missing Authorization-Client-Assertion header',
      );
    }

    const expectedAudience =
      this.config.AUTHORIZATION_ASSERTION_AUD ?? buildRequestAudience(request);

    const verified = await verifyInboundAssertion(
      assertion,
      {
        expectedAudience,
        maxTtlSeconds: this.config.AUTHORIZATION_IDENTITY_ASSERTION_MAX_TTL_SECONDS,
      },
      this.registry,
    );

    if (this.jtiStore !== null) {
      const replayTtl =
        this.config.AUTHORIZATION_IDENTITY_ASSERTION_MAX_TTL_SECONDS + 60;
      await this.jtiStore.assertOnce(verified.jti, replayTtl);
    }

    return true;
  }
}

function buildRequestAudience(request: FastifyRequest): string {
  const protocolHeader = request.headers['x-forwarded-proto'];
  const protocol =
    typeof protocolHeader === 'string' && protocolHeader.length > 0
      ? protocolHeader.split(',')[0]!.trim()
      : request.protocol;

  const hostHeader = request.headers['x-forwarded-host'] ?? request.headers.host;
  const host =
    typeof hostHeader === 'string' && hostHeader.length > 0
      ? hostHeader.split(',')[0]!.trim()
      : '127.0.0.1';

  const path = request.url.split('?')[0] ?? request.url;
  return `${protocol}://${host}${path}`;
}
