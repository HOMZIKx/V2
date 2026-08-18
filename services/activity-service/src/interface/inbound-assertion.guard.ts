import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import type { ActorSubject } from '../application/ports/activity.ports.js';
import { ActivityError } from '../domain/errors.js';
import type { ActivityEnv } from '../infrastructure/config/activity-env.js';
import type { AssertionJtiStore } from '../infrastructure/internal/assertion-jti-store.js';
import {
  type InboundClientRegistry,
  verifyInboundAssertion,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import {
  ACTIVITY_CONFIG,
  ASSERTION_JTI_STORE,
  INBOUND_CLIENT_REGISTRY,
} from './activity.tokens.js';

const ASSERTION_HEADER = 'activity-client-assertion';
export const REQUIRED_OPERATION = 'activity:required_operation';

export const RequireOperation = (operation: string): MethodDecorator =>
  SetMetadata(REQUIRED_OPERATION, operation);

export interface AuthenticatedRequest extends FastifyRequest {
  verifiedClientId?: string;
  verifiedActor?: ActorSubject;
}

@Injectable()
export class InboundAssertionGuard implements CanActivate {
  public constructor(
    @Inject(ACTIVITY_CONFIG) private readonly config: ActivityEnv,
    @Inject(INBOUND_CLIENT_REGISTRY)
    private readonly registry: InboundClientRegistry | null,
    @Optional()
    @Inject(ASSERTION_JTI_STORE)
    private readonly jtiStore: AssertionJtiStore | null,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (this.config.ACTIVITY_ENABLED || this.registry !== null) {
      return this.assertWithClientAssertion(context, request);
    }

    if (this.config.ACTIVITY_TRUST_ACTOR_HEADERS && this.config.NODE_ENV !== 'production') {
      request.verifiedActor = readTrustedActorHeaders(request);
      return true;
    }

    throw new ActivityError(
      'CLIENT_ASSERTION_INVALID',
      'Activity client assertion is required; actor headers are not trusted',
    );
  }

  private async assertWithClientAssertion(
    context: ExecutionContext,
    request: AuthenticatedRequest,
  ): Promise<boolean> {
    if (this.registry === null) {
      throw new ActivityError('CONFIG_INVALID', 'Inbound client registry is not configured');
    }

    if (this.config.NODE_ENV === 'production' && this.jtiStore === null) {
      throw new ActivityError(
        'CONFIG_INVALID',
        'Client assertion replay store is required in production',
      );
    }

    const assertion = requireSingleHeader(request, ASSERTION_HEADER);
    if (assertion === undefined || assertion.length === 0) {
      throw new ActivityError(
        'CLIENT_ASSERTION_INVALID',
        'Missing Activity-Client-Assertion header',
      );
    }

    const expectedAudience = this.config.ACTIVITY_ASSERTION_AUD ?? buildRequestAudience(request);

    const verified = await verifyInboundAssertion(
      assertion,
      {
        expectedAudience,
        maxTtlSeconds: this.config.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      },
      this.registry,
    );

    if (this.jtiStore !== null) {
      await this.jtiStore.assertOnce(
        verified.jti,
        this.config.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      );
    }

    const requiredOperation = this.reflector.get<string | undefined>(
      REQUIRED_OPERATION,
      context.getHandler(),
    );
    if (requiredOperation !== undefined) {
      const client = this.registry.clients.get(verified.clientId);
      if (client === undefined || !client.allowedOperations.has(requiredOperation)) {
        throw new ActivityError(
          'FORBIDDEN',
          `Client not allowed for operation ${requiredOperation}`,
        );
      }
    }

    request.verifiedClientId = verified.clientId;
    request.verifiedActor = {
      ...(verified.actorDiscordUserId !== undefined
        ? { discordUserId: verified.actorDiscordUserId }
        : {}),
      ...(verified.actorV2UserId !== undefined ? { v2UserId: verified.actorV2UserId } : {}),
    };
    return true;
  }
}

function readTrustedActorHeaders(request: FastifyRequest): ActorSubject {
  const discordHeader = requireSingleHeader(request, 'x-actor-discord-user-id');
  const v2Header = requireSingleHeader(request, 'x-actor-v2-user-id');
  return {
    ...(discordHeader !== undefined ? { discordUserId: discordHeader } : {}),
    ...(v2Header !== undefined ? { v2UserId: v2Header } : {}),
  };
}

function requireSingleHeader(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  if (Array.isArray(raw)) {
    throw new ActivityError('CLIENT_ASSERTION_INVALID', `Duplicate ${name} header is not allowed`);
  }
  if (typeof raw === 'string') {
    return raw;
  }
  return undefined;
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && raw[0] !== undefined) {
    return raw[0];
  }
  return undefined;
}

function buildRequestAudience(request: FastifyRequest): string {
  const host = headerValue(request, 'host') ?? '127.0.0.1';
  const protoHeader = request.headers['x-forwarded-proto'];
  const proto =
    typeof protoHeader === 'string'
      ? protoHeader
      : Array.isArray(protoHeader)
        ? (protoHeader[0] ?? 'http')
        : 'http';
  const path = typeof request.url === 'string' ? request.url.split('?')[0] : '/';
  return `${proto}://${host}${path}`;
}
