import { Controller, Get } from '@nestjs/common';

export const healthPayload = () => ({ status: 'ok' as const });

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
