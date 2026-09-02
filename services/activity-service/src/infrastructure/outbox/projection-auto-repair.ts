import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { enqueueEventProjection } from '../../application/enqueue-event-projection.js';
import type { ActivityRepositoryPort } from '../../application/ports/activity.ports.js';
import type { Clock } from '../../domain/clock.js';
import {
  ACTIVITY_CLOCK,
  ACTIVITY_CONFIG,
  ACTIVITY_REPOSITORY,
} from '../../interface/activity.tokens.js';
import type { ActivityEnv } from '../config/activity-env.js';

const POLL_INTERVAL_MS = 15_000;
const CLAIM_LIMIT = 5;
const LEASE_SECONDS = 60;
/** Avoid infinite repair loops for poison projections. */
const MAX_PROJECTION_REPAIR_RETRIES = 20;

/**
 * Automatic recovery for failed/degraded/missing event Discord projections.
 * Re-enqueues full PROJECTION_REQUESTED payloads; outbox remains the delivery path.
 * Admin repair/scan is a safety net, not the normal mechanism.
 */
@Injectable()
export class ActivityProjectionAutoRepair implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityProjectionAutoRepair.name);
  private readonly leaseOwner = `activity-proj-repair:${process.pid}:${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private tickInFlight: Promise<void> | null = null;

  public constructor(
    @Inject(ACTIVITY_CONFIG) private readonly config: ActivityEnv,
    @Inject(ACTIVITY_REPOSITORY) private readonly repository: ActivityRepositoryPort,
    @Inject(ACTIVITY_CLOCK) private readonly clock: Clock,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.config.ACTIVITY_OUTBOX_WORKER_ENABLED) {
      this.logger.log('Projection auto-repair disabled (outbox worker off)');
      return;
    }
    await this.safeTick('startup');
    this.timer = setInterval(() => {
      void this.safeTick('interval');
    }, POLL_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log('Projection auto-repair started', { leaseOwner: this.leaseOwner });
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

  /** Test seam. */
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
      const now = this.clock.now();
      const claimed = await this.repository.withTransaction((tx) =>
        tx.claimProjectionRepair({
          owner: this.leaseOwner,
          limit: CLAIM_LIMIT,
          leaseSeconds: LEASE_SECONDS,
          now,
        }),
      );
      if (claimed.length === 0) {
        return;
      }

      let enqueued = 0;
      let skipped = 0;
      for (const projection of claimed) {
        if (projection.retryCount > MAX_PROJECTION_REPAIR_RETRIES) {
          skipped += 1;
          this.logger.warn('Projection auto-repair skipped (max retries)', {
            activityId: projection.activityId,
            guildId: projection.guildId,
            retryCount: projection.retryCount,
          });
          continue;
        }
        const count = await this.repository.withTransaction(async (tx) => {
          const activity = await tx.getActivity(projection.activityId);
          if (activity === null) {
            return 0;
          }
          return enqueueEventProjection(tx, activity, now, {
            onlyGuildIds: [projection.guildId],
          });
        });
        enqueued += count;
      }
      this.logger.log('Projection auto-repair tick', {
        source,
        claimed: claimed.length,
        enqueued,
        skipped,
      });
    } catch (error) {
      this.logger.error('Projection auto-repair tick failed', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
