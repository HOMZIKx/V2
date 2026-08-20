import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import type { ActivityHttpClient } from '../../infrastructure/activity/activity-http-client.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  DISCORD_ACTIVITY_CLIENT_TOKEN,
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from '../discord/discord.tokens.js';
import { executeHubPanelOperation } from '../discord/hub-panel-operation.js';
import {
  assertProjectionChannelAllowed,
  resolveAllowedProjectionGuild,
} from './projection-channel-scope.js';

const membersBodySchema = z.object({
  userIds: z.array(z.string().min(1)).max(50),
});

const hubBodySchema = z.object({
  channelId: z.string().min(1),
  actorDiscordUserId: z.string().min(1),
});

/**
 * Read-only Discord guild metadata + hub publish/reconcile for Admin.
 * Browser never talks to Discord; activity-service calls these internal routes.
 */
@Controller('internal/activity/v1/guilds')
export class ActivityGuildMetadataController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
    @Inject(DISCORD_ACTIVITY_CLIENT_TOKEN)
    private readonly activityClient: ActivityHttpClient | null,
  ) {}

  @Get()
  public async listGuilds(
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<{ guilds: readonly { id: string; name: string }[] }> {
    this.assertAuthorized(projectionSecret);
    const gateway = this.requireGateway();
    return { guilds: await Promise.resolve(gateway.listGuildPresentations()) };
  }

  @Get(':guildId')
  public async getGuild(
    @Param('guildId') guildId: string,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<{ id: string; name: string }> {
    this.assertAuthorized(projectionSecret);
    const gateway = this.requireGateway();
    const guild = await gateway.getGuildPresentation(guildId);
    if (guild === null) {
      throw new HttpException(
        { status: 'rejected', detail: 'Guild is not available to this bot.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return guild;
  }

  @Get(':guildId/channels')
  public async listChannels(
    @Param('guildId') guildId: string,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ) {
    this.assertAuthorized(projectionSecret);
    const gateway = this.requireGateway();
    return { channels: await gateway.listGuildChannelsForAdmin(guildId) };
  }

  @Get(':guildId/roles')
  public async listRoles(
    @Param('guildId') guildId: string,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ) {
    this.assertAuthorized(projectionSecret);
    const gateway = this.requireGateway();
    return { roles: await gateway.listGuildRolesForAdmin(guildId) };
  }

  @Post(':guildId/members/resolve')
  @HttpCode(200)
  public async resolveMembers(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ) {
    this.assertAuthorized(projectionSecret);
    const parsed = membersBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { status: 'rejected', detail: 'Invalid member resolve payload.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const gateway = this.requireGateway();
    return { members: await gateway.resolveMemberDisplays(guildId, parsed.data.userIds) };
  }

  @Post(':guildId/hub/publish')
  @HttpCode(200)
  public async publishHub(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ) {
    return this.runHub(guildId, body, projectionSecret, false);
  }

  @Post(':guildId/hub/reconcile')
  @HttpCode(200)
  public async reconcileHub(
    @Param('guildId') guildId: string,
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ) {
    return this.runHub(guildId, body, projectionSecret, true);
  }

  private async runHub(
    guildId: string,
    body: unknown,
    projectionSecret: string | undefined,
    preferScanFirst: boolean,
  ) {
    this.assertAuthorized(projectionSecret);
    const parsed = hubBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { status: 'rejected', detail: 'Invalid hub publish payload.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const gateway = this.requireGateway();
    const allowedGuildId = resolveAllowedProjectionGuild({
      configuredGuildId: this.config.DISCORD_TEST_GUILD_ID,
      allowedGuildIds: this.config.activityAllowedGuildIds,
      payloadGuildId: guildId,
    });
    await assertProjectionChannelAllowed({
      gateway,
      allowedGuildId,
      channelId: parsed.data.channelId,
    });
    if (this.activityClient === null) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        detail: 'Activity client is not configured.',
      });
    }
    const logger = {
      info(message: string, meta?: Record<string, unknown>): void {
        void message;
        void meta;
      },
      warn(message: string, meta?: Record<string, unknown>): void {
        void message;
        void meta;
      },
      error(message: string, meta?: Record<string, unknown>): void {
        void message;
        void meta;
      },
    };
    const delivered = await executeHubPanelOperation(
      { gateway, logger, activityClient: this.activityClient },
      {
        guildId,
        channelId: parsed.data.channelId,
        actorDiscordUserId: parsed.data.actorDiscordUserId,
        organizationId: this.config.ACTIVITY_ORGANIZATION_ID,
        signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
        preferScanFirst,
      },
    );
    return { mode: delivered.mode, messageId: delivered.messageId };
  }

  private requireGateway(): DiscordJsGatewayAdapter {
    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        detail: 'Discord gateway is disabled.',
      });
    }
    return this.gateway;
  }

  private assertAuthorized(projectionSecret: string | undefined): void {
    if (!this.config.DISCORD_ACTIVITY_ENABLED) {
      throw new UnauthorizedException('Discord activity metadata is disabled.');
    }
    const expected = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    if (expected.length > 0) {
      if (projectionSecret !== expected) {
        throw new UnauthorizedException('Invalid projection secret.');
      }
      return;
    }
    if (!this.config.ACTIVITY_ENABLED && this.config.ACTIVITY_CLIENT_MODE === 'headers') {
      return;
    }
    throw new UnauthorizedException(
      'Guild metadata requires ACTIVITY_PROJECTION_SHARED_SECRET outside local headers mode.',
    );
  }
}
