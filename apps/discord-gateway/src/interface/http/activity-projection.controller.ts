import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  projectionDeliveryEnvelopeSchema,
  type ProjectionDeliveryResult,
} from '../../application/activity/activity-projection-envelope.js';
import { ActivityProjectionDeliveryService } from '../../infrastructure/activity/activity-projection-delivery.service.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { DISCORD_CONFIG_TOKEN } from '../discord/discord.tokens.js';

export type { ProjectionDeliveryResult };

/**
 * Internal projection HTTP endpoint — NOT a general "send message" API.
 * Accepts only typed hub/event projection payloads from activity-service.
 *
 * HTTP = operator / reconcile / diagnostic path.
 * RabbitMQ (`activity.projection.discord`) = normal async path.
 */
@Controller('internal/activity/v1/projections')
export class ActivityProjectionController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    private readonly delivery: ActivityProjectionDeliveryService,
  ) {}

  @Post('deliver')
  @HttpCode(200)
  public async deliver(
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<ProjectionDeliveryResult> {
    this.assertAuthorized(projectionSecret);

    if (!this.config.DISCORD_ENABLED) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        detail: 'Discord gateway is disabled.',
      });
    }

    const parsed = projectionDeliveryEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { status: 'rejected', detail: 'Invalid projection payload.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.delivery.deliver(parsed.data);
    if (result.status === 'rate_limited') {
      throw new HttpException(result, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (result.status === 'upstream_error') {
      throw new HttpException(result, HttpStatus.BAD_GATEWAY);
    }
    if (result.status === 'rejected') {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  private assertAuthorized(projectionSecret: string | undefined): void {
    if (!this.config.DISCORD_ACTIVITY_ENABLED) {
      throw new UnauthorizedException('Discord activity projections are disabled.');
    }

    const expected = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    if (expected.length > 0) {
      if (projectionSecret !== expected) {
        throw new UnauthorizedException('Invalid projection secret.');
      }
      return;
    }

    if (!this.config.ACTIVITY_ENABLED && this.config.ACTIVITY_CLIENT_MODE === 'headers') {
      return;
    }

    throw new UnauthorizedException(
      'Projection delivery requires ACTIVITY_PROJECTION_SHARED_SECRET outside local headers mode.',
    );
  }
}
