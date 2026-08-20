import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';

import {
  ActivityProjectionDeliveryService,
  type ProjectionDeliveryResult,
} from '../../infrastructure/messaging/activity-projection-delivery.service.js';

export type { ProjectionDeliveryResult };

/**
 * Internal projection consumer — NOT a general "send message" API.
 * Accepts only typed hub/event projection payloads from activity-service.
 */
@Controller('internal/activity/v1/projections')
export class ActivityProjectionController {
  public constructor(
    @Inject(ActivityProjectionDeliveryService)
    private readonly delivery: ActivityProjectionDeliveryService,
  ) {}

  @Post('deliver')
  @HttpCode(200)
  public async deliver(
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<ProjectionDeliveryResult> {
    return this.delivery.deliver(body, projectionSecret);
  }
}
