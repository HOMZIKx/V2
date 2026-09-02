import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';

import {
  NotificationDmDeliveryService,
  type NotificationDmDeliveryResult,
} from '../../infrastructure/messaging/notification-dm-delivery.service.js';

@Controller('internal/activity/v1/notifications')
export class NotificationDeliveryController {
  public constructor(
    @Inject(NotificationDmDeliveryService)
    private readonly delivery: NotificationDmDeliveryService,
  ) {}

  @Post('deliver')
  @HttpCode(200)
  public async deliver(
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<NotificationDmDeliveryResult> {
    return this.delivery.deliver(body, projectionSecret);
  }
}
