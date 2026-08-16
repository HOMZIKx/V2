import { Module, type Provider } from '@nestjs/common';

import { ActivityProxyController } from './activity-proxy.controller.js';
import {
  ACTIVITY_SERVICE_BASE_URL,
  API_GATEWAY_FORWARD_ACTOR_HEADERS,
} from './activity-proxy.tokens.js';
import { HealthController } from './health.controller.js';

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return fallback;
}

const providers: Provider[] = [
  {
    provide: ACTIVITY_SERVICE_BASE_URL,
    useFactory: (): string | null => {
      const value = process.env.ACTIVITY_SERVICE_BASE_URL?.trim();
      return value !== undefined && value.length > 0 ? value : null;
    },
  },
  {
    provide: API_GATEWAY_FORWARD_ACTOR_HEADERS,
    useFactory: (): boolean =>
      parseBooleanEnv(process.env.API_GATEWAY_FORWARD_ACTOR_HEADERS, false),
  },
];

@Module({
  controllers: [HealthController, ActivityProxyController],
  providers,
})
export class AppModule {}
