import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import path from 'node:path';

import { PanelRegistry } from '../../application/technika/panel-registry.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  parsePanelPublishAppearance,
  type PanelPublishAppearance,
} from '../../presentation/discord/panel-publish-appearance.js';
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

function resolveRegistryPath(config: DiscordGatewayConfig): string {
  if (config.DISCORD_GATEWAY_DATA_DIR.trim().length > 0) {
    return path.resolve(config.DISCORD_GATEWAY_DATA_DIR, 'technika-panels-registry.json');
  }
  const cwd = process.cwd().replace(/\\/g, '/');
  const base = cwd.endsWith('/apps/discord-gateway')
    ? path.resolve(process.cwd(), 'data')
    : path.resolve(process.cwd(), 'apps/discord-gateway/data');
  return path.join(base, 'technika-panels-registry.json');
}

/**
 * Kuzyn / New Bot contract — guild-scoped panel routes (exact paths, not query style).
 * Reuses DiscordJsGatewayAdapter panel helpers from /discord/v1/panels/*.
 */
@Controller('discord/v1/guilds/:guildId')
export class TechnikaGuildPanelsController {
  private readonly registry: PanelRegistry;

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly envConfig: DiscordGatewayConfig,
    @Optional()
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null = null,
  ) {
    this.registry = new PanelRegistry(resolveRegistryPath(envConfig));
  }

  /** GET /discord/v1/guilds/{guildId}/channels */
  @Get('channels')
  public async listChannels(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildIdRaw: string,
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

  /** GET /discord/v1/guilds/{guildId}/panels */
  @Get('panels')
  public async listPanels(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildIdRaw: string,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly panels: readonly {
      readonly id: string;
      readonly panelId: string;
      readonly messageId: string;
      readonly channelId: string;
      readonly kind: string;
      readonly jumpUrl: string;
      readonly isComponentsV2?: boolean;
      readonly createdAt?: string;
      readonly updatedAt?: string;
    }[];
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    this.assertGuildAllowed(guildId, 'read');
    const gateway = this.requireGateway();

    const stored = this.registry.listByGuild(guildId);
    const byId = new Map(stored.map((p) => [p.id, p]));

    // Best-effort live scan so /panel-test posts also appear.
    try {
      const channels = await gateway.listGuildTextChannels(guildId);
      for (const channel of channels.slice(0, 30)) {
        try {
          const found = await gateway.listRecentBotPanels(guildId, channel.id);
          for (const panel of found) {
            const now = new Date().toISOString();
            const existing = byId.get(panel.messageId);
            const row = {
              id: panel.messageId,
              guildId,
              channelId: channel.id,
              messageId: panel.messageId,
              kind: existing?.kind ?? 'lab',
              jumpUrl: panel.jumpUrl,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            };
            byId.set(panel.messageId, row);
            this.registry.upsert(row);
          }
        } catch {
          // skip channel
        }
      }
    } catch {
      // registry-only fallback
    }

    const panels = [...byId.values()].map((p) => ({
      id: p.id,
      panelId: p.id,
      messageId: p.messageId,
      channelId: p.channelId,
      kind: p.kind,
      jumpUrl: p.jumpUrl,
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
    }));

    return { ok: true, guildId, panels };
  }

  /** POST /discord/v1/guilds/{guildId}/panels/publish  body { kind, channelId } */
  @Post('panels/publish')
  public async publish(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildIdRaw: string,
    @Body() body: unknown,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly channelId: string;
    readonly panelId: string;
    readonly messageId: string;
    readonly kind: string;
    readonly jumpUrl: string;
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    this.assertGuildAllowed(guildId, 'mutate');
    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const channelId = requireSnowflake(record.channelId, 'channelId');
    const kind =
      typeof record.kind === 'string' && record.kind.trim().length > 0 ? record.kind.trim() : 'lab';
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
    const now = new Date().toISOString();
    const jumpUrl = `https://discord.com/channels/${guildId}/${channelId}/${sent.messageId}`;
    this.registry.upsert({
      id: sent.messageId,
      guildId,
      channelId,
      messageId: sent.messageId,
      kind,
      jumpUrl,
      createdAt: now,
      updatedAt: now,
      appearance,
    });
    return {
      ok: true,
      guildId,
      channelId,
      panelId: sent.messageId,
      messageId: sent.messageId,
      kind,
      jumpUrl,
    };
  }

  /** POST /discord/v1/guilds/{guildId}/panels/{panelId}/refresh */
  @Post('panels/:panelId/refresh')
  public async refresh(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildIdRaw: string,
    @Param('panelId') panelIdRaw: string,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly panelId: string;
    readonly messageId: string;
    readonly channelId: string;
    readonly refreshed: true;
    readonly jumpUrl: string;
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    const panelId = requireSnowflake(panelIdRaw, 'panelId');
    this.assertGuildAllowed(guildId, 'mutate');
    const gateway = this.requireGateway();
    const located = await this.resolvePanel(gateway, guildId, panelId);

    const appearance = located.appearance ?? {};
    const panel = renderPanelMessage(
      appearanceToRenderInput(this.envConfig.DISCORD_COMPONENT_SIGNING_SECRET, appearance),
    );
    await gateway.refreshGuildPanelMessage({
      guildId,
      channelId: located.channelId,
      messageId: located.messageId,
      message: panel,
    });

    const now = new Date().toISOString();
    const jumpUrl =
      located.jumpUrl ??
      `https://discord.com/channels/${guildId}/${located.channelId}/${located.messageId}`;
    this.registry.upsert({
      id: located.messageId,
      guildId,
      channelId: located.channelId,
      messageId: located.messageId,
      kind: located.kind ?? 'lab',
      jumpUrl,
      createdAt: located.createdAt ?? now,
      updatedAt: now,
      ...(located.appearance ? { appearance: located.appearance } : {}),
    });

    return {
      ok: true,
      guildId,
      panelId: located.messageId,
      messageId: located.messageId,
      channelId: located.channelId,
      refreshed: true,
      jumpUrl,
    };
  }

  /** POST /discord/v1/guilds/{guildId}/panels/{panelId}/delete */
  @Post('panels/:panelId/delete')
  public async remove(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildIdRaw: string,
    @Param('panelId') panelIdRaw: string,
  ): Promise<{
    readonly ok: true;
    readonly deleted: true;
    readonly guildId: string;
    readonly panelId: string;
    readonly messageId: string;
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    const panelId = requireSnowflake(panelIdRaw, 'panelId');
    this.assertGuildAllowed(guildId, 'mutate');
    const gateway = this.requireGateway();
    const located = await this.resolvePanel(gateway, guildId, panelId);

    await gateway.deleteGuildPanelMessage({
      guildId,
      channelId: located.channelId,
      messageId: located.messageId,
    });
    this.registry.remove(guildId, located.messageId);

    return {
      ok: true,
      deleted: true,
      guildId,
      panelId: located.messageId,
      messageId: located.messageId,
    };
  }

  /** GET /discord/v1/guilds/{guildId}/roles — read-only; prod hard-stop does NOT apply. */
  @Get('roles')
  public async listRoles(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildIdRaw: string,
  ): Promise<{
    readonly ok: true;
    readonly guildId: string;
    readonly roles: readonly { readonly id: string; readonly name: string }[];
  }> {
    this.requireSecret(secret);
    const guildId = requireSnowflake(guildIdRaw, 'guildId');
    const gateway = this.requireGateway();
    const roles = await gateway.listGuildRoles(guildId);
    return { ok: true, guildId, roles };
  }

  private async resolvePanel(
    gateway: DiscordJsGatewayAdapter,
    guildId: string,
    panelId: string,
  ): Promise<{
    channelId: string;
    messageId: string;
    kind?: string;
    jumpUrl?: string;
    createdAt?: string;
    appearance?: PanelPublishAppearance;
  }> {
    const stored = this.registry.get(guildId, panelId);
    if (stored) {
      return {
        channelId: stored.channelId,
        messageId: stored.messageId,
        kind: stored.kind,
        jumpUrl: stored.jumpUrl,
        createdAt: stored.createdAt,
        ...(stored.appearance ? { appearance: stored.appearance } : {}),
      };
    }

    const channels = await gateway.listGuildTextChannels(guildId);
    for (const channel of channels.slice(0, 40)) {
      try {
        const found = await gateway.listRecentBotPanels(guildId, channel.id);
        const hit = found.find((p) => p.messageId === panelId);
        if (hit) {
          return {
            channelId: channel.id,
            messageId: hit.messageId,
            kind: 'lab',
            jumpUrl: hit.jumpUrl,
          };
        }
      } catch {
        // continue
      }
    }

    throw new NotFoundException({
      ok: false,
      error: 'panel_not_found',
      guildId,
      panelId,
    });
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
      throw new ForbiddenException({
        ok: false,
        error: 'panel_ops_test_guild_only',
        guildId,
        allowedGuildId: testId,
      });
    }
  }
}
