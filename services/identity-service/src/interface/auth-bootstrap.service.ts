import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';

import type { AuthRuntime } from '../infrastructure/auth/create-better-auth.js';
import { mountBetterAuth } from '../infrastructure/auth/mount-better-auth.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { AUTH_RUNTIME, IDENTITY_CONFIG } from './identity.tokens.js';

/**
 * Thin interface-layer mount: on module init, when auth is enabled, register
 * the Better Auth Fastify handler and CORS on the underlying Fastify instance.
 * Config fail-fast has already happened at parse time.
 */
@Injectable()
export class AuthBootstrapService implements OnModuleInit {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime | null,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (this.runtime === null || !this.config.IDENTITY_AUTH_ENABLED) {
      return;
    }

    const fastify = this.httpAdapterHost.httpAdapter.getInstance<FastifyInstance>();
    await mountBetterAuth({ fastify, auth: this.runtime.auth, config: this.config });
  }
}
