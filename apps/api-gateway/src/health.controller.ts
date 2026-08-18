import { Controller, Get } from '@nestjs/common';
import { readRuntimeRevision } from '@v2/configuration';

export const healthPayload = () => ({
  status: 'ok' as const,
  ...readRuntimeRevision(),
});

@Controller('health')
export class HealthController {
  @Get('live')
  live() {
    return healthPayload();
  }

  @Get('ready')
  ready() {
    return healthPayload();
  }
}
