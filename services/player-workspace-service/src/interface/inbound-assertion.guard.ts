import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { ActorSubject } from '../application/ports/player-workspace.ports.js';
import { PlayerWorkspaceError } from '../domain/errors.js';
import type { PlayerWorkspaceEnv } from '../infrastructure/config/player-workspace-env.js';
import type { AssertionJtiStore } from '../infrastructure/internal/assertion-jti-store.js';
import {
  type InboundClientRegistry,
  verifyInboundAssertion,
} from '../infrastructure/internal/verify-inbound-assertion.js';
import {
  ASSERTION_JTI_STORE,
  INBOUND_CLIENT_REGISTRY,
  PLAYER_WORKSPACE_CONFIG,
} from './player-workspace.tokens.js';

const ASSERTION_HEADER = 'player-workspace-client-assertion';

export interface AuthenticatedRequest extends FastifyRequest {
  verifiedClientId?: string;
  verifiedActor?: ActorSubject;
}

@Injectable()
export class InboundAssertionGuard implements CanActivate {
  public constructor(
    @Inject(PLAYER_WORKSPACE_CONFIG) private readonly config: PlayerWorkspaceEnv,
    @Inject(INBOUND_CLIENT_REGISTRY)
    private readonly registry: InboundClientRegistry | null,
    @Optional()
    @Inject(ASSERTION_JTI_STORE)
    private readonly jtiStore: AssertionJtiStore | null,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (this.registry !== null) {
      return this.assertWithClientAssertion(request);
    }

    if (this.config.PLAYER_WORKSPACE_TRUST_ACTOR_HEADERS && this.config.NODE_ENV !== 'production') {
      request.verifiedActor = readTrustedActorHeaders(request);
      return true;
    }

    throw new PlayerWorkspaceError(
      'CLIENT_ASSERTION_INVALID',
      'Player Workspace client assertion is required; actor headers are not trusted',
    );
  }

  private async assertWithClientAssertion(request: AuthenticatedRequest): Promise<boolean> {
    if (this.registry === null) {
      throw new PlayerWorkspaceError('CONFIG_INVALID', 'Inbound client registry is not configured');
    }

    if (this.config.NODE_ENV === 'production' && this.jtiStore === null) {
      throw new PlayerWorkspaceError(
        'CONFIG_INVALID',
        'Client assertion replay store is required in production',
      );
    }

    const assertion = requireSingleHeader(request, ASSERTION_HEADER);
    if (assertion === undefined || assertion.length === 0) {
      throw new PlayerWorkspaceError(
        'CLIENT_ASSERTION_INVALID',
        'Missing Player-Workspace-Client-Assertion header',
      );
    }

    const expectedAudience =
      this.config.PLAYER_WORKSPACE_ASSERTION_AUD ?? buildRequestAudience(request);

    const verified = await verifyInboundAssertion(
      assertion,
      {
        expectedAudience,
        maxTtlSeconds: this.config.PLAYER_WORKSPACE_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      },
      this.registry,
    );

    if (this.jtiStore !== null) {
      await this.jtiStore.assertOnce(
        verified.jti,
        this.config.PLAYER_WORKSPACE_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      );
    }

    if (verified.actorV2UserId === undefined || verified.actorV2UserId.length === 0) {
      throw new PlayerWorkspaceError(
        'UNAUTHENTICATED',
        'actor_v2_user_id is required for Player Workspace operations',
      );
    }

    request.verifiedClientId = verified.clientId;
    request.verifiedActor = {
      v2UserId: verified.actorV2UserId,
      ...(verified.actorDiscordUserId !== undefined
        ? { discordUserId: verified.actorDiscordUserId }
        : {}),
    };
    return true;
  }
}

function readTrustedActorHeaders(request: FastifyRequest): ActorSubject {
  const v2Header = requireSingleHeader(request, 'x-actor-v2-user-id');
  if (v2Header === undefined || v2Header.length === 0) {
    throw new PlayerWorkspaceError('UNAUTHENTICATED', 'x-actor-v2-user-id is required');
  }
  const discordHeader = requireSingleHeader(request, 'x-actor-discord-user-id');
  return {
    v2UserId: v2Header,
    ...(discordHeader !== undefined ? { discordUserId: discordHeader } : {}),
  };
}

function requireSingleHeader(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  if (Array.isArray(raw)) {
    throw new PlayerWorkspaceError(
      'CLIENT_ASSERTION_INVALID',
      `Duplicate ${name} header is not allowed`,
    );
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
