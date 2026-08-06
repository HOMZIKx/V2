import { Body, Controller, HttpCode, Inject, Post, Req, UseFilters } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import type { ClientAssertionPort } from '../application/ports/internal-token.ports.js';
import { revokeSessionsForUserSystem } from '../application/use-cases/system-revoke.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import {
  CLIENT_ASSERTION_PORT,
  IDENTITY_CONFIG,
  IDENTITY_SESSION_PORT,
} from './identity.tokens.js';

const revokeBodySchema = z.object({
  v2_user_id: z.string().uuid(),
  reason: z.string().min(1).max(512),
  correlation_id: z.string().min(1).max(128),
});

function readClientAssertion(request: FastifyRequest): string | undefined {
  const assertionHeader = request.headers['identity-client-assertion'];
  if (typeof assertionHeader === 'string') {
    return assertionHeader;
  }
  if (Array.isArray(assertionHeader)) {
    return assertionHeader[0];
  }
  return undefined;
}

/**
 * System-to-system session revoke (no user cookie / internal JWT).
 * Callers (e.g. authorization-service) must present a client assertion whose
 * aud exactly equals IDENTITY_SYSTEM_REVOKE_URL.
 */
@Controller('identity/v1/system')
@UseFilters(IdentityExceptionFilter)
export class SystemRevokeController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(IDENTITY_SESSION_PORT) private readonly sessionPort: IdentitySessionPort | null,
    @Inject(CLIENT_ASSERTION_PORT) private readonly assertionPort: ClientAssertionPort | null,
  ) {}

  private requireEnabled(): {
    sessionPort: IdentitySessionPort;
    assertionPort: ClientAssertionPort;
  } {
    if (!this.config.IDENTITY_INTERNAL_JWT_ENABLED) {
      throw new IdentityError('INTERNAL_JWT_DISABLED');
    }
    if (this.sessionPort === null || this.assertionPort === null) {
      throw new IdentityError('INTERNAL_JWT_DISABLED');
    }
    return {
      sessionPort: this.sessionPort,
      assertionPort: this.assertionPort,
    };
  }

  @Post('revoke-sessions')
  @HttpCode(200)
  public async revokeSessions(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): Promise<{ status: 'ok'; revoked_user_id: string; correlation_id: string }> {
    const { sessionPort, assertionPort } = this.requireEnabled();

    const parsedBody = revokeBodySchema.safeParse(body);
    if (!parsedBody.success) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        'Invalid revoke body (v2_user_id uuid, reason, correlation_id required)',
      );
    }

    const replayTtl =
      this.config.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS +
      this.config.IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS;

    return revokeSessionsForUserSystem(sessionPort, assertionPort, {
      clientAssertion: readClientAssertion(request),
      expectedAudience: this.config.IDENTITY_SYSTEM_REVOKE_URL,
      assertionReplayTtlSeconds: replayTtl,
      v2UserId: parsedBody.data.v2_user_id,
      reason: parsedBody.data.reason,
      correlationId: parsedBody.data.correlation_id,
    });
  }
}
