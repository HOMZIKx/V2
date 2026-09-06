import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Put,
} from '@nestjs/common';

import { upsertGuildInConfig } from '../../application/technika/bot-config.schema.js';
import {
  defaultGuildConfig,
  type GuildConfig,
  type GuildModuleFlags,
  type GuildRight,
} from '../../application/technika/capabilities.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from '../discord/discord.tokens.js';
import { assertTechnikaSecret, TECHNIKA_SECRET_HEADER } from './technika-auth.js';

/** Flat Technika UI contract (Kuzyn). */
export type TechnikaGuildDto = {
  readonly id: string;
  readonly name?: string;
  readonly enabled: boolean;
  readonly modules: GuildModuleFlags;
  readonly rights: readonly string[];
  readonly source?: 'configured' | 'discovered' | 'both';
  readonly notes?: string;
};

function toDto(
  guildId: string,
  config: GuildConfig | null,
  discoveredName: string | null,
  source: 'configured' | 'discovered' | 'both',
): TechnikaGuildDto {
  const base = config ?? defaultGuildConfig({ enabled: false });
  // Prefer live Discord name from discovery over stale Technika displayName.
  // Ignore placeholder "Guild-{snowflake}" values persisted by Kuzyn fallback.
  const liveName = discoveredName?.trim() || null;
  const storedRaw = config?.displayName?.trim() || null;
  const storedName =
    storedRaw && !/^Guild-\d{17,20}$/.test(storedRaw) ? storedRaw : null;
  const name = liveName || storedName || undefined;
  return {
    id: guildId,
    ...(name ? { name } : {}),
    enabled: base.enabled,
    modules: base.modules,
    rights: [...base.rights],
    source,
    ...(base.notes ? { notes: base.notes } : {}),
  };
}

function bodyToGuildConfig(body: unknown): unknown {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const b = body as Record<string, unknown>;
  // Accept flat DTO { id?, name, enabled, modules, rights } OR nested GuildConfig
  if ('modules' in b && 'enabled' in b) {
    const rights = Array.isArray(b.rights) ? (b.rights as GuildRight[]) : undefined;
    return {
      enabled: Boolean(b.enabled),
      ...(typeof b.name === 'string'
        ? { displayName: b.name }
        : typeof b.displayName === 'string'
          ? { displayName: b.displayName }
          : {}),
      modules: b.modules,
      rights: rights ?? ['technika.config', 'discord.notify', 'discord.panels'],
      ...(typeof b.notes === 'string' ? { notes: b.notes } : {}),
    };
  }
  return body;
}

@Controller('discord/v1/guilds')
export class TechnikaGuildsController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly envConfig: DiscordGatewayConfig,
    @Inject(TECHNIKA_CONFIG_STORE_TOKEN) private readonly store: VersionedConfigStore,
    @Optional()
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null = null,
  ) {}

  @Get()
  public async listGuilds(): Promise<{
    readonly guilds: readonly TechnikaGuildDto[];
    readonly revision: number;
    readonly botReady: boolean;
    readonly hasDraft: boolean;
  }> {
    const snap = this.store.getActiveSnapshot();
    const configured = snap.config.guilds ?? {};
    const testId = this.envConfig.DISCORD_TEST_GUILD_ID?.trim();
    const resolveIds = [
      ...Object.keys(configured),
      ...(testId && /^\d{17,20}$/.test(testId) ? [testId] : []),
    ];
    await this.refreshDiscovery(resolveIds);
    const discovered = this.discoverJoinedGuilds();
    const ids = new Set([...Object.keys(configured), ...discovered.keys()]);

    if (testId && /^\d{17,20}$/.test(testId)) {
      ids.add(testId);
      if (!discovered.has(testId)) {
        discovered.set(testId, {
          name: 'DISCORD_TEST_GUILD_ID (env)',
          memberCount: null,
        });
      }
    }

    const guilds = [...ids].sort().map((guildId) => {
      const config = configured[guildId] ?? null;
      const meta = discovered.get(guildId);
      const source: 'configured' | 'discovered' | 'both' =
        config && meta ? 'both' : config ? 'configured' : 'discovered';
      return toDto(guildId, config, meta?.name ?? null, source);
    });

    const botReady =
      this.gateway !== null && this.gateway.getSnapshot().state === 'ready';

    return {
      guilds,
      revision: snap.revision,
      botReady,
      hasDraft: snap.hasDraft,
    };
  }

  @Get(':guildId')
  public async getGuild(@Param('guildId') guildId: string): Promise<TechnikaGuildDto> {
    if (!/^\d{17,20}$/.test(guildId)) {
      throw new BadRequestException({ ok: false, error: 'invalid_guild_id' });
    }
    const found = (await this.listGuilds()).guilds.find((g) => g.id === guildId);
    if (!found) {
      throw new NotFoundException({ ok: false, error: 'guild_not_found', guildId });
    }
    return found;
  }

  /**
   * Upsert into versioned **draft** (`config.guilds[guildId]`).
   * Promote with POST /discord/v1/config/apply (same store as characterTimers).
   */
  @Put(':guildId')
  public putGuild(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildId: string,
    @Body() body: unknown,
  ): {
    readonly ok: true;
    readonly guild: TechnikaGuildDto;
    readonly revision: number;
    readonly status: 'draft';
    readonly hasDraft: true;
    readonly updatedAt: string;
  } {
    assertTechnikaSecret(secret, this.envConfig.DISCORD_TECHNIKA_SHARED_SECRET);

    if (!/^\d{17,20}$/.test(guildId)) {
      throw new BadRequestException({ ok: false, error: 'invalid_guild_id' });
    }

    const base =
      this.store.getDraftSnapshot()?.config ?? this.store.getActiveSnapshot().config;
    const normalized = bodyToGuildConfig(body);
    const validated = upsertGuildInConfig(base, guildId, normalized);
    if (!validated.ok) {
      throw new BadRequestException({
        ok: false,
        error: 'validation_failed',
        issues: validated.issues,
      });
    }

    const guildCfg = validated.config.guilds[guildId];
    if (!guildCfg) {
      throw new BadRequestException({ ok: false, error: 'guild_upsert_failed' });
    }

    const result = this.store.putDraft({
      guilds: {
        ...base.guilds,
        [guildId]: guildCfg,
      },
    });
    if (!result.ok) {
      throw new BadRequestException({
        ok: false,
        error: 'validation_failed',
        issues: result.issues,
      });
    }

    const draft = this.store.getDraftSnapshot();
    return {
      ok: true,
      guild: toDto(guildId, guildCfg, guildCfg.displayName ?? null, 'configured'),
      revision: draft?.revision ?? this.store.getActiveSnapshot().revision,
      status: 'draft',
      hasDraft: true,
      updatedAt: draft?.updatedAt ?? this.store.getActiveSnapshot().updatedAt,
    };
  }

  private async refreshDiscovery(extraGuildIds: readonly string[] = []): Promise<void> {
    const gateway = this.gateway as
      | (DiscordJsGatewayAdapter & {
          refreshJoinedGuildDirectory?: (
            extraGuildIds?: readonly string[],
          ) => Promise<unknown>;
        })
      | null;
    if (gateway && typeof gateway.refreshJoinedGuildDirectory === 'function') {
      try {
        await gateway.refreshJoinedGuildDirectory(extraGuildIds);
      } catch {
        // best-effort; list still uses cache
      }
    }
  }

  private discoverJoinedGuilds(): Map<
    string,
    { name: string; memberCount: number | null }
  > {
    const map = new Map<string, { name: string; memberCount: number | null }>();
    const gateway = this.gateway as
      | (DiscordJsGatewayAdapter & {
          listJoinedGuildSummaries?: () => ReadonlyArray<{
            id: string;
            name: string;
            memberCount: number | null;
          }>;
        })
      | null;
    if (!gateway || typeof gateway.listJoinedGuildSummaries !== 'function') {
      return map;
    }
    try {
      for (const g of gateway.listJoinedGuildSummaries()) {
        map.set(g.id, { name: g.name, memberCount: g.memberCount });
      }
    } catch {
      // best-effort
    }
    return map;
  }
}
