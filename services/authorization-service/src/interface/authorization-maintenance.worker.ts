import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  AuthorizationStorePort,
  SessionRevokePort,
} from '../application/ports/authorization.ports.js';
import { runMaintenanceTick } from '../application/use-cases/authorization.use-cases.js';
import type { AuthorizationEnv } from '../infrastructure/config/authorization-env.js';
import {
  AUTHORIZATION_CONFIG,
  AUTHORIZATION_STORE_PORT,
  SESSION_REVOKE_PORT,
} from './authorization.tokens.js';

/**
 * Autonomous maintenance: startup drain + periodic expiry processing and
 * pending session-revoke delivery with leased claims (multi-instance safe).
 * Does not depend on Discord/policy mutations or the manual maintenance endpoint.
 */
@Injectable()
export class AuthorizationMaintenanceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthorizationMaintenanceWorker.name);
  private readonly leaseOwner = `authz-worker:${process.pid}:${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private tickInFlight: Promise<void> | null = null;

  public constructor(
    @Inject(AUTHORIZATION_CONFIG) private readonly config: AuthorizationEnv,
    @Inject(AUTHORIZATION_STORE_PORT) private readonly store: AuthorizationStorePort,
    @Inject(SESSION_REVOKE_PORT) private readonly revoke: SessionRevokePort | null,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.config.AUTHORIZATION_ENABLED) {
      return;
    }
    if (this.config.AUTHORIZATION_MAINTENANCE_INTERVAL_MS === 0) {
      this.logger.log('Authorization maintenance worker disabled (interval=0)');
      return;
    }

    // Startup drain: expire stale policies and deliver pending revokes even when
    // Identity was down and no new Discord/policy event arrives.
    await this.safeTick('startup');

    this.timer = setInterval(() => {
      void this.safeTick('interval');
    }, this.config.AUTHORIZATION_MAINTENANCE_INTERVAL_MS);
    // Do not keep the process alive solely because of the timer.
    this.timer.unref?.();
    this.logger.log('Authorization maintenance worker started', {
      intervalMs: this.config.AUTHORIZATION_MAINTENANCE_INTERVAL_MS,
      leaseOwner: this.leaseOwner,
    });
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.tickInFlight !== null) {
      await this.tickInFlight.catch(() => undefined);
    }
  }

  /** Exposed for unit tests. */
  public async runOnce(): Promise<void> {
    await this.safeTick('manual');
  }

  private async safeTick(source: string): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.tickInFlight !== null) {
      return;
    }
    this.tickInFlight = this.executeTick(source).finally(() => {
      this.tickInFlight = null;
    });
    await this.tickInFlight;
  }

  private async executeTick(source: string): Promise<void> {
    try {
      const result = await runMaintenanceTick(this.store, this.revoke, {
        leaseOwner: this.leaseOwner,
        revokeLimit: this.config.AUTHORIZATION_REVOKE_BATCH_LIMIT,
        leaseSeconds: this.config.AUTHORIZATION_REVOKE_LEASE_SECONDS,
        maxAttempts: this.config.AUTHORIZATION_REVOKE_MAX_ATTEMPTS,
      });
      if (
        result.expirations.revokedUserIds.length > 0 ||
        result.revokes.delivered > 0 ||
        result.revokes.failed > 0 ||
        result.revokes.terminalFailed > 0
      ) {
        this.logger.log('Authorization maintenance tick', {
          source,
          expiredRevokes: result.expirations.revokedUserIds.length,
          delivered: result.revokes.delivered,
          failed: result.revokes.failed,
          terminalFailed: result.revokes.terminalFailed,
        });
      }
    } catch (error) {
      this.logger.error('Authorization maintenance tick failed', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
