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
  probeUpstreamReadyBody,
  readOutboxReadySnapshot,
  type DiscordRuntimeSnapshot,
  type OutboxReadySnapshot,
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
    outbox?: OutboxReadySnapshot;
  }> {
    const [activityProbe, identityProbe, discord] = await Promise.all([
      probeUpstreamReadyBody(this.activityBaseUrl),
      probeUpstreamReadyBody(this.identityBaseUrl),
      probeDiscordRuntime(this.discordBaseUrl),
    ]);
    const activity = activityProbe.state;
    const identity = identityProbe.state;
    const outbox = readOutboxReadySnapshot(activityProbe.body);
    const checks = { activity, identity };
    if (!isGatewayReady(activity, identity)) {
      throw new ServiceUnavailableException({
        status: 'error',
        ...readRuntimeRevision(),
        checks,
        discord,
        ...(outbox !== undefined ? { outbox } : {}),
      });
    }
    return {
      ...healthPayload(),
      checks,
      discord,
      ...(outbox !== undefined ? { outbox } : {}),
    };
  }
}
