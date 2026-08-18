import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

import { ACTIVITY_SERVICE_BASE_URL, IDENTITY_SERVICE_BASE_URL } from './activity-proxy.tokens.js';

const UPSTREAM_PROBE_TIMEOUT_MS = 2_000;

export const healthPayload = () => ({
  status: 'ok' as const,
  ...readRuntimeRevision(),
});

async function probeLive(baseUrl: string | null): Promise<boolean> {
  if (baseUrl === null || baseUrl.length === 0) {
    return true;
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health/live`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

@Controller()
export class HealthController {
  public constructor(
    @Optional()
    @Inject(ACTIVITY_SERVICE_BASE_URL)
    private readonly activityBaseUrl: string | null = null,
    @Optional()
    @Inject(IDENTITY_SERVICE_BASE_URL)
    private readonly identityBaseUrl: string | null = null,
  ) {}

  @Get('health/live')
  live() {
    return healthPayload();
  }

  @Get('version')
  version() {
    return healthPayload();
  }

  @Get('health/ready')
  async ready() {
    const checks = {
      activity: await probeLive(this.activityBaseUrl),
      identity: await probeLive(this.identityBaseUrl),
    };
    if (!checks.activity || !checks.identity) {
      throw new ServiceUnavailableException({
        status: 'error',
        ...readRuntimeRevision(),
        checks,
      });
    }
    return { ...healthPayload(), checks };
  }
}
