import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  public live(): { readonly ok: true } {
    return { ok: true };
  }

  @Get('ready')
  public ready(): { readonly ok: true } {
    return { ok: true };
  }
}

