import { Module, type Provider } from '@nestjs/common';

import { ActivityProxyController } from './activity-proxy.controller.js';
import { ACTIVITY_SERVICE_BASE_URL } from './activity-proxy.tokens.js';
import { HealthController } from './health.controller.js';

const providers: Provider[] = [
  {
    provide: ACTIVITY_SERVICE_BASE_URL,
    useFactory: (): string | null => {
      const value = process.env.ACTIVITY_SERVICE_BASE_URL?.trim();
      return value !== undefined && value.length > 0 ? value : null;
    },
  },
];

@Module({
  controllers: [HealthController, ActivityProxyController],
  providers,
})
export class AppModule {}
