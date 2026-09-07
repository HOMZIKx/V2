import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Optional,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { parsePanelPublishAppearance } from '../../presentation/discord/panel-publish-appearance.js';
import {
  appearanceToRenderInput,
  renderPanelMessage,
} from '../../presentation/discord/panel-renderer.js';
import { DISCORD_CONFIG_TOKEN, DISCORD_GATEWAY_TOKEN } from '../discord/discord.tokens.js';
import { assertTechnikaSecret, TECHNIKA_SECRET_HEADER } from './technika-auth.js';

/** Hard-stop: never publish/list-mutate Destiled / Sojusz via Technika panels API. */
const PROD_GUILD_HARD_STOP = new Set<string>(['1543972927719080016', '1531318787058696424']);

function requireSnowflake(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value.trim())) {
    throw new BadRequestException({ ok: false, error: 'invalid_snowflake', field });
  }
  return value.trim();
}

@Controller('discord/v1/panels')
export class TechnikaPanelsController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly envConfig: DiscordGatewayConfig,
    @Optional()
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null = null,
  ) {}

  /** 1/5 — list text channels the bot can see in a guild (TEST only while hard-stop). */
  @Get('channels')
  public async listChannels(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Query('guildId') guildIdRaw: string | undefined,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly channels: readonly {
      readonly id: string;
      readonly name: string;
      readonly type: number;
      readonly canPublish: boolean;
    }[];
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    this.assertGuildAllowed(guildId, 'read');
    const gateway = this.requireGateway();
    const channels = await gateway.listGuildTextChannels(guildId);
    return { ok: true, guildId, channels };
  }

  /** 2/5 — recent bot panel messages in a channel (Components V2 / legacy). */
  @Get()
  public async listPanels(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Query('guildId') guildIdRaw: string | undefined,
    @Query('channelId') channelIdRaw: string | undefined,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly channelId: string;
    readonly panels: readonly {
      readonly messageId: string;
      readonly isComponentsV2: boolean;
      readonly jumpUrl: string;
    }[];
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    const channelId = requireSnowflake(channelIdRaw, 'channelId');
    this.assertGuildAllowed(guildId, 'read');
    const gateway = this.requireGateway();
    const panels = await gateway.listRecentBotPanels(guildId, channelId);
    return { ok: true, guildId, channelId, panels };
  }

  /** 3/5 — render Components V2 panel payload without sending. */
  @Post('preview')
  public preview(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
  ): {
    readonly ok: true;
    readonly guildId: string;
    readonly renderer: 'components-v2-container';
    readonly flags: number;
    readonly componentCount: number;
    readonly hasBanner: boolean;
    readonly title: string | null;
    readonly enabledActions: readonly string[];
    readonly customButtonCount: number;
  } {
    this.requireSecret(secret);
    const guildId = requireSnowflake(
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).guildId
        : undefined,
      'guildId',
    );
    this.assertGuildAllowed(guildId, 'read');
    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const appearance = parsePanelPublishAppearance(record);
    const panel = renderPanelMessage(
      appearanceToRenderInput(this.envConfig.DISCORD_COMPONENT_SIGNING_SECRET, appearance),
    );
    return {
      ok: true,
      guildId,
      renderer: 'components-v2-container',
      flags: typeof panel.flags === 'number' ? panel.flags : 0,
      componentCount: panel.components?.length ?? 0,
      hasBanner:
        (panel.files?.length ?? 0) > 0 ||
        Boolean(appearance.bannerUrl && appearance.includeBanner !== false),
      title: appearance.title ?? null,
      enabledActions: appearance.enabledActions ?? [],
      customButtonCount: appearance.customButtons?.length ?? 0,
    };
  }

  /** 4/5 — publish lab panel to a guild text channel (TEST guild only). */
  @Post('publish')
  public async publish(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly channelId: string;
    readonly messageId: string;
    readonly jumpUrl: string;
  }> {
    this.requireSecret(secret);
    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const guildId = requireSnowflake(record.guildId, 'guildId');
    this.assertGuildAllowed(guildId, 'mutate');
    const channelId = requireSnowflake(record.channelId, 'channelId');
    const gateway = this.requireGateway();

    const perms = await gateway.checkChannelPermissions(guildId, channelId);
    if (!perms.ok) {
      throw new ForbiddenException({
        ok: false,
        error: 'missing_channel_permissions',
        missing: perms.missing,
      });
    }

    const appearance = parsePanelPublishAppearance(record);
    const panel = renderPanelMessage(
      appearanceToRenderInput(this.envConfig.DISCORD_COMPONENT_SIGNING_SECRET, appearance),
    );
    const sent = await gateway.publishGuildPanel({
      guildId,
      channelId,
      message: panel,
    });
    return {
      ok: true,
      guildId,
      channelId,
      messageId: sent.messageId,
      jumpUrl: `https://discord.com/channels/${guildId}/${channelId}/${sent.messageId}`,
    };
  }

  /** 5/5 — delete a previously published bot panel message (TEST guild only). */
  @Delete()
  public async remove(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
    @Query('guildId') guildIdQ?: string,
    @Query('channelId') channelIdQ?: string,
    @Query('messageId') messageIdQ?: string,
  ): Promise<{ readonly ok: true; readonly deleted: true; readonly messageId: string }> {
    this.requireSecret(secret);
    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const guildId = requireSnowflake(record.guildId ?? guildIdQ, 'guildId');
    const channelId = requireSnowflake(record.channelId ?? channelIdQ, 'channelId');
    const messageId = requireSnowflake(record.messageId ?? messageIdQ, 'messageId');
    this.assertGuildAllowed(guildId, 'mutate');
    const gateway = this.requireGateway();
    await gateway.deleteGuildPanelMessage({ guildId, channelId, messageId });
    return { ok: true, deleted: true, messageId };
  }

  private requireSecret(secret: string | undefined): void {
    assertTechnikaSecret(secret, this.envConfig.DISCORD_TECHNIKA_SHARED_SECRET);
  }

  private requireGateway(): DiscordJsGatewayAdapter {
    if (!this.gateway) {
      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_gateway_offline',
        hint: 'Uruchom discord-gateway z DISCORD_ENABLED=true.',
      });
    }
    return this.gateway;
  }

  /**
   * Prod Destiled/Sojusz: always forbidden.
   * Mutating ops: only DISCORD_TEST_GUILD_ID (TESTOWY).
   */
  private assertGuildAllowed(guildId: string, mode: 'read' | 'mutate'): void {
    if (PROD_GUILD_HARD_STOP.has(guildId)) {
      throw new ForbiddenException({
        ok: false,
        error: 'prod_guild_hard_stop',
        guildId,
        hint: 'Destiled/Sojusz zablokowane — zero publish/send z Technika panels API.',
      });
    }
    const testId = this.envConfig.DISCORD_TEST_GUILD_ID?.trim();
    if (mode === 'mutate' && testId && guildId !== testId) {
      throw new ForbiddenException({
        ok: false,
        error: 'panel_ops_test_guild_only',
        guildId,
        allowedGuildId: testId,
      });
    }
    if (mode === 'read' && testId && guildId !== testId) {
      // Read also locked to TEST while prod hard-stop is active (no drive-by channel ops).
      throw new ForbiddenException({
        ok: false,
        error: 'panel_ops_test_guild_only',
        guildId,
        allowedGuildId: testId,
      });
    }
  }
}
