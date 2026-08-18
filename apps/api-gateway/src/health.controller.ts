import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

import {
  ACTIVITY_SERVICE_BASE_URL,
  DISCORD_GATEWAY_BASE_URL,
  IDENTITY_SERVICE_BASE_URL,
} from './activity-proxy.tokens.js';
import {
  isGatewayReady,
  probeDiscordRuntime,
  probeUpstreamReady,
  type DiscordRuntimeSnapshot,
  type UpstreamReadyState,
} from './health-probes.js';

export const healthPayload = () => ({
  status: 'ok' as const,
  ...readRuntimeRevision(),
});

@Controller()
export class HealthController {
  public constructor(
    @Optional()
    @Inject(ACTIVITY_SERVICE_BASE_URL)
    private readonly activityBaseUrl: string | null = null,
    @Optional()
    @Inject(IDENTITY_SERVICE_BASE_URL)
    private readonly identityBaseUrl: string | null = null,
    @Optional()
    @Inject(DISCORD_GATEWAY_BASE_URL)
    private readonly discordBaseUrl: string | null = null,
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
  async ready(): Promise<{
    status: 'ok';
    checks: { activity: UpstreamReadyState; identity: UpstreamReadyState };
    discord: DiscordRuntimeSnapshot;
  }> {
    const [activity, identity, discord] = await Promise.all([
      probeUpstreamReady(this.activityBaseUrl),
      probeUpstreamReady(this.identityBaseUrl),
      probeDiscordRuntime(this.discordBaseUrl),
    ]);
    const checks = { activity, identity };
    if (!isGatewayReady(activity, identity)) {
      throw new ServiceUnavailableException({
        status: 'error',
        ...readRuntimeRevision(),
        checks,
        discord,
      });
    }
    return { ...healthPayload(), checks, discord };
  }
}
