import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import type { InternalJwtRuntime } from '../infrastructure/internal-jwt/create-internal-jwt-runtime.js';
import { INTERNAL_JWT_RUNTIME } from './identity.tokens.js';

/**
 * Closes the assertion JTI Redis store exactly once on Nest shutdown.
 */
@Injectable()
export class InternalJwtLifecycleService implements OnModuleDestroy {
  private closed = false;

  public constructor(
    @Inject(INTERNAL_JWT_RUNTIME)
    private readonly runtime: InternalJwtRuntime | null,
  ) {}

  public async onModuleDestroy(): Promise<void> {
    if (this.runtime === null || this.closed) {
      return;
    }
    this.closed = true;
    await this.runtime.close();
  }
}
