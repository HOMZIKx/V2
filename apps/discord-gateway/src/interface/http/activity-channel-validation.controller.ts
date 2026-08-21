import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { timingSafeEqualUtf8 } from '../../infrastructure/security/timing-safe-equal.js';
import { DISCORD_CONFIG_TOKEN, DISCORD_GATEWAY_TOKEN } from '../discord/discord.tokens.js';

const validateBodySchema = z.object({
  guildId: z.string().min(1),
  channelIds: z.array(z.string().min(1)).max(50),
});

export type ChannelValidationApiResult = {
  readonly channelId: string;
  readonly ok: boolean;
  readonly code?:
    | 'CHANNEL_MISSING'
    | 'CHANNEL_WRONG_GUILD'
    | 'CHANNEL_UNSUPPORTED'
    | 'BOT_PERMISSION_MISSING'
    | 'CHANNEL_OK';
  readonly detail?: string;
};

/**
 * Internal channel validation for activity-service admin config.
 * Auth mirrors projection deliver (shared secret / local headers mode).
 */
@Controller('internal/activity/v1/channels')
export class ActivityChannelValidationController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  @Post('validate')
  @HttpCode(200)
  public async validate(
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<{ results: ChannelValidationApiResult[] }> {
    this.assertAuthorized(projectionSecret);

    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        detail: 'Discord gateway is disabled.',
      });
    }

    const parsed = validateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { status: 'rejected', detail: 'Invalid channel validation payload.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const uniqueIds = [...new Set(parsed.data.channelIds)];
    const results: ChannelValidationApiResult[] = [];
    for (const channelId of uniqueIds) {
      const validated = await this.gateway.validateActivityPublishChannel(
        parsed.data.guildId,
        channelId,
      );
      results.push({
        channelId,
        ok: validated.ok,
        code: validated.code,
        ...(validated.detail !== undefined ? { detail: validated.detail } : {}),
      });
    }

    return { results };
  }

  private assertAuthorized(projectionSecret: string | undefined): void {
    if (!this.config.DISCORD_ACTIVITY_ENABLED) {
      throw new UnauthorizedException('Discord activity channel validation is disabled.');
    }

    const expected = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    if (expected.length > 0) {
      if (
        projectionSecret === undefined ||
        !timingSafeEqualUtf8(projectionSecret, expected)
      ) {
        throw new UnauthorizedException('Invalid projection secret.');
      }
      return;
    }

    if (!this.config.ACTIVITY_ENABLED && this.config.ACTIVITY_CLIENT_MODE === 'headers') {
      return;
    }

    throw new UnauthorizedException(
      'Channel validation requires ACTIVITY_PROJECTION_SHARED_SECRET outside local headers mode.',
    );
  }
}
