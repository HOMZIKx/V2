import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ActivityProjectionDeliveryV1Schema,
  type ActivityProjectionDeliveryV1,
} from '@v2/contracts';
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type { ActivityEventPublisherPort } from '../../application/ports/activity-event-publisher.port.js';
import type {
  ActivityRepositoryPort,
  OutboxMessageRecord,
} from '../../application/ports/activity.ports.js';
import type { Clock } from '../../domain/clock.js';
import {
  ACTIVITY_CLOCK,
  ACTIVITY_CONFIG,
  ACTIVITY_EVENT_PUBLISHER,
  ACTIVITY_REPOSITORY,
} from '../../interface/activity.tokens.js';
import type { ActivityEnv } from '../config/activity-env.js';

const DELIVER_PATH = '/internal/activity/v1/projections/deliver';
const POLL_INTERVAL_MS = 2_000;
const CLAIM_LIMIT = 10;
const LEASE_SECONDS = 30;
const ASSERTION_HEADER = 'discord-client-assertion';

function isRetryableHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500;
}

function backoffMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(300_000, 5_000 * 2 ** exponent);
}

function optionalStringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function buildProjectionDeliveryEnvelope(
  message: OutboxMessageRecord,
): ActivityProjectionDeliveryV1 {
  const guildId = optionalStringField(message.payload, 'guildId');
  const correlationId = optionalStringField(message.payload, 'correlationId');
  return ActivityProjectionDeliveryV1Schema.parse({
    outboxId: message.id,
    eventType: message.eventType,
    aggregateType: message.aggregateType,
    aggregateId: message.aggregateId,
    aggregateVersion: message.aggregateVersion,
    payload: message.payload,
    attemptCount: message.attemptCount,
    ...(guildId !== undefined ? { guildId } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
  });
}

@Injectable()
export class ActivityOutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityOutboxDispatcher.name);
  private readonly leaseOwner = `activity-outbox:${process.pid}:${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private tickInFlight: Promise<void> | null = null;
  private fetchImpl: typeof globalThis.fetch;

  public constructor(
    @Inject(ACTIVITY_CONFIG) private readonly config: ActivityEnv,
    @Inject(ACTIVITY_REPOSITORY) private readonly repository: ActivityRepositoryPort,
    @Inject(ACTIVITY_CLOCK) private readonly clock: Clock,
    @Optional()
    @Inject(ACTIVITY_EVENT_PUBLISHER)
    private readonly publisher: ActivityEventPublisherPort | null = null,
  ) {
    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  /** Test seam for fetch. */
  public setFetchImpl(fetchImpl: typeof globalThis.fetch): void {
    this.fetchImpl = fetchImpl;
  }

  public async onModuleInit(): Promise<void> {
    if (!this.config.ACTIVITY_OUTBOX_WORKER_ENABLED) {
      this.logger.log('Activity outbox dispatcher disabled (ACTIVITY_OUTBOX_WORKER_ENABLED=false)');
      return;
    }

    if (this.config.ACTIVITY_OUTBOX_TRANSPORT === 'rabbitmq') {
      if (this.publisher === null) {
        this.logger.error('Outbox worker enabled (rabbitmq) but publisher is not configured');
        return;
      }
      try {
        await this.publisher.connect();
      } catch (error) {
        this.logger.error('Failed to connect RabbitMQ outbox publisher', {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    } else if (this.config.ACTIVITY_DISCORD_PROJECTION_BASE_URL === undefined) {
      this.logger.error(
        'Outbox worker enabled but ACTIVITY_DISCORD_PROJECTION_BASE_URL is missing',
      );
      return;
    }

    await this.safeTick('startup');
    this.timer = setInterval(() => {
      void this.safeTick('interval');
    }, POLL_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log('Activity outbox dispatcher started', {
      leaseOwner: this.leaseOwner,
      transport: this.config.ACTIVITY_OUTBOX_TRANSPORT,
      ...(this.config.ACTIVITY_OUTBOX_TRANSPORT === 'http'
        ? { baseUrl: this.config.ACTIVITY_DISCORD_PROJECTION_BASE_URL }
        : {}),
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
    if (this.publisher !== null) {
      await this.publisher.close().catch(() => undefined);
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
      const now = this.clock.now();
      const claimed = await this.repository.withTransaction((tx) =>
        tx.claimOutbox({
          owner: this.leaseOwner,
          limit: CLAIM_LIMIT,
          leaseSeconds: LEASE_SECONDS,
          now,
        }),
      );
      if (claimed.length === 0) {
        return;
      }

      let published = 0;
      let retrying = 0;
      let failed = 0;
      for (const message of claimed) {
        this.logger.log('Activity outbox queued', {
          outboxId: message.id,
          eventType: message.eventType,
          guildId: optionalStringField(message.payload, 'guildId'),
          correlationId: optionalStringField(message.payload, 'correlationId'),
        });
        const outcome = await this.deliver(message);
        if (outcome === 'published') {
          published += 1;
        } else if (outcome === 'retrying') {
          retrying += 1;
        } else {
          failed += 1;
        }
      }
      this.logger.log('Activity outbox tick', {
        source,
        claimed: claimed.length,
        published,
        retrying,
        failed,
        transport: this.config.ACTIVITY_OUTBOX_TRANSPORT,
      });
    } catch (error) {
      this.logger.error('Activity outbox tick failed', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async deliver(
    message: OutboxMessageRecord,
  ): Promise<'published' | 'retrying' | 'failed'> {
    if (this.config.ACTIVITY_OUTBOX_TRANSPORT === 'rabbitmq') {
      return this.deliverViaRabbitMq(message);
    }
    return this.deliverViaHttp(message);
  }

  private async deliverViaRabbitMq(
    message: OutboxMessageRecord,
  ): Promise<'published' | 'retrying' | 'failed'> {
    if (this.publisher === null) {
      await this.failRetry(message, 'RabbitMQ publisher is not configured');
      this.logOutcome('retrying', message, 'publisher missing');
      return 'retrying';
    }

    let envelope: ActivityProjectionDeliveryV1;
    try {
      envelope = buildProjectionDeliveryEnvelope(message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Invalid delivery envelope';
      await this.repository.withTransaction((tx) => tx.permanentFailOutbox(message.id, detail));
      this.logOutcome('failed', message, detail);
      return 'failed';
    }

    try {
      await this.publisher.publish(envelope);
      await this.repository.withTransaction((tx) => tx.completeOutbox(message.id));
      this.logOutcome('published', message);
      return 'published';
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'RabbitMQ publish failed';
      await this.failRetry(message, detail);
      this.logOutcome('retrying', message, detail);
      return 'retrying';
    }
  }

  private async deliverViaHttp(
    message: OutboxMessageRecord,
  ): Promise<'published' | 'retrying' | 'failed'> {
    const baseUrl = this.config.ACTIVITY_DISCORD_PROJECTION_BASE_URL;
    if (baseUrl === undefined) {
      await this.failRetry(message, 'ACTIVITY_DISCORD_PROJECTION_BASE_URL missing');
      this.logOutcome('retrying', message, 'ACTIVITY_DISCORD_PROJECTION_BASE_URL missing');
      return 'retrying';
    }

    const url = `${baseUrl.replace(/\/$/, '')}${DELIVER_PATH}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (this.config.ACTIVITY_ENABLED) {
      try {
        headers[ASSERTION_HEADER] = await this.signAssertion();
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Failed to sign Discord assertion';
        await this.failRetry(message, detail);
        this.logOutcome('retrying', message, detail);
        return 'retrying';
      }
    }

    const envelope = buildProjectionDeliveryEnvelope(message);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Projection deliver network error';
      await this.failRetry(message, detail);
      this.logOutcome('retrying', message, detail);
      return 'retrying';
    }

    if (response.ok) {
      await this.repository.withTransaction((tx) => tx.completeOutbox(message.id));
      this.logOutcome('published', message);
      return 'published';
    }

    const bodyText = await response.text().catch(() => '');
    const errorText = `HTTP ${response.status}: ${bodyText.slice(0, 500)}`;
    if (isRetryableHttpStatus(response.status)) {
      await this.failRetry(message, errorText);
      this.logOutcome('retrying', message, errorText);
      return 'retrying';
    }

    await this.repository.withTransaction((tx) => tx.permanentFailOutbox(message.id, errorText));
    this.logOutcome('failed', message, errorText);
    return 'failed';
  }

  private logOutcome(
    status: 'published' | 'retrying' | 'failed',
    message: OutboxMessageRecord,
    detail?: string,
  ): void {
    this.logger.log(`Activity outbox ${status}`, {
      outboxId: message.id,
      eventType: message.eventType,
      guildId: optionalStringField(message.payload, 'guildId'),
      correlationId: optionalStringField(message.payload, 'correlationId'),
      ...(detail !== undefined ? { detail: detail.slice(0, 200) } : {}),
    });
  }

  private async failRetry(message: OutboxMessageRecord, error: string): Promise<void> {
    const availableAt = new Date(this.clock.now().getTime() + backoffMs(message.attemptCount));
    await this.repository.withTransaction((tx) => tx.failOutbox(message.id, error, availableAt));
  }

  private async signAssertion(): Promise<string> {
    const privateKeyPem = this.config.ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM;
    const kid = this.config.ACTIVITY_TO_DISCORD_ACTIVE_KID;
    const audience = this.config.ACTIVITY_DISCORD_ASSERTION_AUD;
    if (privateKeyPem === undefined || kid === undefined || audience === undefined) {
      throw new Error('Discord projection assertion signing is not configured');
    }

    const key = await importPKCS8(privateKeyPem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .setIssuer(this.config.ACTIVITY_TO_DISCORD_CLIENT_ID)
      .setSubject(this.config.ACTIVITY_TO_DISCORD_CLIENT_ID)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS)
      .sign(key);
  }
}
