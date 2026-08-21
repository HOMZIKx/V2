import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type {
  ActivityRepositoryPort,
  OutboxMessageRecord,
} from '../../application/ports/activity.ports.js';
import type { Clock } from '../../domain/clock.js';
import { OUTBOX_EVENT_TYPES } from '../../domain/outbox-events.js';
import {
  ACTIVITY_CLOCK,
  ACTIVITY_CONFIG,
  ACTIVITY_REPOSITORY,
} from '../../interface/activity.tokens.js';
import type { ActivityEnv } from '../config/activity-env.js';
import { ActivityOutboxRabbitPublisher } from './outbox-rabbit-publisher.js';

const DELIVER_PATH = '/internal/activity/v1/projections/deliver';
const POLL_INTERVAL_MS = 2_000;
const CLAIM_LIMIT = 10;
const LEASE_SECONDS = 30;
const ASSERTION_HEADER = 'discord-client-assertion';
/** Shared contract with discord-gateway ActivityProjectionController. */
export const PROJECTION_SECRET_HEADER = 'x-activity-projection-secret';

/** Outbox rows that must be applied to Discord (HTTP/Rabbit deliver). */
const DISCORD_DELIVER_EVENT_TYPES = new Set<string>([
  OUTBOX_EVENT_TYPES.PROJECTION_REQUESTED,
  OUTBOX_EVENT_TYPES.PANEL_PROJECTION_REPAIRED,
]);

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

@Injectable()
export class ActivityOutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityOutboxDispatcher.name);
  private readonly leaseOwner = `activity-outbox:${process.pid}:${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private tickInFlight: Promise<void> | null = null;
  private fetchImpl: typeof globalThis.fetch;
  private rabbitPublisher: ActivityOutboxRabbitPublisher | null = null;

  public constructor(
    @Inject(ACTIVITY_CONFIG) private readonly config: ActivityEnv,
    @Inject(ACTIVITY_REPOSITORY) private readonly repository: ActivityRepositoryPort,
    @Inject(ACTIVITY_CLOCK) private readonly clock: Clock,
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

    const transport = this.config.ACTIVITY_OUTBOX_TRANSPORT;
    const needsHttp = transport === 'http' || transport === 'dual';
    const needsRabbit = transport === 'rabbitmq' || transport === 'dual';

    if (needsHttp && this.config.ACTIVITY_DISCORD_PROJECTION_BASE_URL === undefined) {
      throw new Error(
        'Outbox worker enabled but ACTIVITY_DISCORD_PROJECTION_BASE_URL is missing (fail fast)',
      );
    }
    if (
      needsHttp &&
      (this.config.ACTIVITY_PROJECTION_SHARED_SECRET === undefined ||
        this.config.ACTIVITY_PROJECTION_SHARED_SECRET.trim().length === 0)
    ) {
      throw new Error(
        'Outbox worker enabled but ACTIVITY_PROJECTION_SHARED_SECRET is missing (fail fast)',
      );
    }
    if (needsRabbit) {
      const rabbitUrl = this.config.ACTIVITY_RABBITMQ_URL;
      if (rabbitUrl === undefined || rabbitUrl.trim().length === 0) {
        throw new Error('Outbox worker enabled but ACTIVITY_RABBITMQ_URL is missing (fail fast)');
      }
      this.rabbitPublisher = new ActivityOutboxRabbitPublisher(rabbitUrl);
      await this.rabbitPublisher.ensureReady();
    }

    await this.safeTick('startup');
    this.timer = setInterval(() => {
      void this.safeTick('interval');
    }, POLL_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log('Activity outbox dispatcher started', {
      leaseOwner: this.leaseOwner,
      transport,
      baseUrl: this.config.ACTIVITY_DISCORD_PROJECTION_BASE_URL,
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
    if (this.rabbitPublisher !== null) {
      await this.rabbitPublisher.close();
      this.rabbitPublisher = null;
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

      let delivered = 0;
      let retried = 0;
      let permanent = 0;
      for (const message of claimed) {
        const outcome = await this.deliver(message);
        if (outcome === 'delivered') {
          delivered += 1;
        } else if (outcome === 'retry') {
          retried += 1;
        } else {
          permanent += 1;
        }
      }
      this.logger.log('Activity outbox tick', {
        source,
        claimed: claimed.length,
        delivered,
        retried,
        permanent,
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
  ): Promise<'delivered' | 'retry' | 'permanent'> {
    // Domain events (CREATED/RSVP/…) are durable audit/signal rows.
    // Discord apply goes only through PROJECTION_REQUESTED (full enriched payload).
    if (!DISCORD_DELIVER_EVENT_TYPES.has(message.eventType)) {
      await this.repository.withTransaction((tx) => tx.completeOutbox(message.id));
      return 'delivered';
    }

    const transport = this.config.ACTIVITY_OUTBOX_TRANSPORT;
    const needsHttp = transport === 'http' || transport === 'dual';
    const needsRabbit = transport === 'rabbitmq' || transport === 'dual';

    if (needsRabbit) {
      const publisher = this.rabbitPublisher;
      if (publisher === null) {
        await this.failRetry(message, 'RabbitMQ publisher not initialized');
        return 'retry';
      }
      const rabbitResult = await publisher.publish(message);
      if (rabbitResult !== 'confirmed') {
        await this.failRetry(message, `RabbitMQ publish ${rabbitResult}`);
        return 'retry';
      }
      // Pure rabbitmq: do NOT complete until Discord consumer ACKs.
      // Until delivery receipts exist, keep dual/http as SoT for Discord apply.
      if (!needsHttp) {
        await this.failRetry(
          message,
          'ACTIVITY_OUTBOX_TRANSPORT=rabbitmq requires Discord delivery receipt (use http or dual)',
        );
        return 'retry';
      }
    }

    if (!needsHttp) {
      await this.failRetry(message, 'No outbox transport configured');
      return 'retry';
    }

    return this.deliverHttp(message);
  }

  private async deliverHttp(
    message: OutboxMessageRecord,
  ): Promise<'delivered' | 'retry' | 'permanent'> {
    const baseUrl = this.config.ACTIVITY_DISCORD_PROJECTION_BASE_URL;
    if (baseUrl === undefined) {
      await this.failRetry(message, 'ACTIVITY_DISCORD_PROJECTION_BASE_URL missing');
      return 'retry';
    }

    const url = `${baseUrl.replace(/\/$/, '')}${DELIVER_PATH}`;
    const secret = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    if (secret === undefined || secret.trim().length === 0) {
      await this.failRetry(message, 'ACTIVITY_PROJECTION_SHARED_SECRET missing');
      return 'retry';
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [PROJECTION_SECRET_HEADER]: secret,
    };

    if (this.config.ACTIVITY_ENABLED) {
      try {
        headers[ASSERTION_HEADER] = await this.signAssertion();
      } catch (error) {
        await this.failRetry(
          message,
          error instanceof Error ? error.message : 'Failed to sign Discord assertion',
        );
        return 'retry';
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          outboxId: message.id,
          eventType: message.eventType,
          aggregateType: message.aggregateType,
          aggregateId: message.aggregateId,
          aggregateVersion: message.aggregateVersion,
          payload: message.payload,
          attemptCount: message.attemptCount,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      await this.failRetry(
        message,
        error instanceof Error ? error.message : 'Projection deliver network error',
      );
      return 'retry';
    }

    if (response.ok) {
      const bodyText = await response.text().catch(() => '');
      await this.completeWithMessageWriteBack(message, bodyText);
      return 'delivered';
    }

    const bodyText = await response.text().catch(() => '');
    const errorText = `HTTP ${response.status}: ${bodyText.slice(0, 500)}`;
    if (isRetryableHttpStatus(response.status)) {
      await this.failRetry(message, errorText);
      return 'retry';
    }

    await this.repository.withTransaction((tx) => tx.permanentFailOutbox(message.id, errorText));
    return 'permanent';
  }

  private async completeWithMessageWriteBack(
    message: OutboxMessageRecord,
    bodyText: string,
  ): Promise<void> {
    let messageId: string | undefined;
    let channelId: string | undefined;
    try {
      const parsed = JSON.parse(bodyText) as {
        messageId?: unknown;
        channelId?: unknown;
      };
      if (typeof parsed.messageId === 'string' && parsed.messageId.length > 0) {
        messageId = parsed.messageId;
      }
      if (typeof parsed.channelId === 'string' && parsed.channelId.length > 0) {
        channelId = parsed.channelId;
      }
    } catch {
      // Response may be empty; still complete outbox.
    }
    const payloadGuild =
      typeof message.payload.guildId === 'string' ? message.payload.guildId : undefined;
    const payloadChannel =
      typeof message.payload.channelId === 'string' ? message.payload.channelId : undefined;
    const payloadOpaque =
      typeof message.payload.opaqueEventId === 'string'
        ? message.payload.opaqueEventId
        : typeof message.payload.opaqueId === 'string'
          ? message.payload.opaqueId
          : undefined;
    const guildId = payloadGuild;
    channelId = channelId ?? payloadChannel;

    await this.repository.withTransaction(async (tx) => {
      await tx.completeOutbox(message.id);
      if (
        message.eventType === OUTBOX_EVENT_TYPES.PROJECTION_REQUESTED &&
        messageId !== undefined &&
        channelId !== undefined &&
        guildId !== undefined &&
        payloadOpaque !== undefined
      ) {
        const removed = message.payload.remove === true;
        await tx.upsertActivityProjection({
          activityId: message.aggregateId,
          guildId,
          channelId,
          opaqueId: payloadOpaque,
          messageId: removed ? null : messageId,
          status: removed ? 'removed' : 'delivered',
          lastError: null,
          retryCount: 0,
        });
      }
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
