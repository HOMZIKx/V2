import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseFilters } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import type {
  ClientAssertionPort,
  InternalJwtIssuePort,
} from '../application/ports/internal-token.ports.js';
import { issueInternalToken } from '../application/use-cases/internal-token.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import {
  CLIENT_ASSERTION_PORT,
  IDENTITY_CONFIG,
  IDENTITY_SESSION_PORT,
  INTERNAL_JWT_ISSUE_PORT,
} from './identity.tokens.js';
import { toWebHeaders } from './request-headers.js';

const audienceSchema = z.object({
  audience: z.string().min(1).max(256),
});

@Controller('identity')
@UseFilters(IdentityExceptionFilter)
export class InternalTokenController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(IDENTITY_SESSION_PORT) private readonly sessionPort: IdentitySessionPort | null,
    @Inject(CLIENT_ASSERTION_PORT) private readonly assertionPort: ClientAssertionPort | null,
    @Inject(INTERNAL_JWT_ISSUE_PORT) private readonly issuePort: InternalJwtIssuePort | null,
  ) {}

  private requireEnabled(): {
    sessionPort: IdentitySessionPort;
    assertionPort: ClientAssertionPort;
    issuePort: InternalJwtIssuePort;
  } {
    if (!this.config.IDENTITY_INTERNAL_JWT_ENABLED) {
      throw new IdentityError('INTERNAL_JWT_DISABLED');
    }
    if (this.sessionPort === null || this.assertionPort === null || this.issuePort === null) {
      throw new IdentityError('INTERNAL_JWT_DISABLED');
    }
    return {
      sessionPort: this.sessionPort,
      assertionPort: this.assertionPort,
      issuePort: this.issuePort,
    };
  }

  @Get('.well-known/jwks.json')
  public getJwks(): { keys: readonly Record<string, unknown>[] } {
    const { issuePort } = this.requireEnabled();
    return issuePort.getJwks();
  }

  @Post('internal-token')
  @HttpCode(200)
  public async issueToken(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number }> {
    const { sessionPort, assertionPort, issuePort } = this.requireEnabled();

    const assertionHeader = request.headers['identity-client-assertion'];
    const assertion =
      typeof assertionHeader === 'string'
        ? assertionHeader
        : Array.isArray(assertionHeader)
          ? assertionHeader[0]
          : undefined;

    if (assertion === undefined || assertion.length === 0) {
      throw new IdentityError(
        'CLIENT_ASSERTION_INVALID',
        'Missing Identity-Client-Assertion header',
      );
    }

    const parsedBody = audienceSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid audience');
    }

    const replayTtl =
      this.config.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS +
      this.config.IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS;

    const issued = await issueInternalToken(sessionPort, assertionPort, issuePort, {
      clientAssertion: assertion,
      userSessionHeaders: toWebHeaders(request.headers),
      audience: parsedBody.data.audience,
      assertionReplayTtlSeconds: replayTtl,
    });

    return {
      access_token: issued.accessToken,
      token_type: issued.tokenType,
      expires_in: issued.expiresInSeconds,
    };
  }
}
