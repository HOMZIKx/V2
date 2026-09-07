import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Optional,
  Post,
  Put,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { applyMessageTemplate } from '../../application/config/live-bot-config.js';
import {
  ApplyValidationError,
  RollbackUnavailableError,
  type VersionedConfigStore,
} from '../../application/technika/versioned-config-store.js';
import type { BotConfigValues } from '../../application/technika/capabilities.js';
import { parseOperatorIds, type DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import {
  NotifyDmClosedError,
  type DiscordJsGatewayAdapter,
} from '../../infrastructure/discord/discord-js-adapter.js';
import { renderKingdomWarReminder } from '../../presentation/discord/kingdom-war-renderer.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from '../discord/discord.tokens.js';
import { assertTechnikaSecret, TECHNIKA_SECRET_HEADER } from './technika-auth.js';

type TestDmModule = 'timersNotify' | 'characterTimers' | 'kingdomWar';

@Controller('discord/v1/config')
export class TechnikaConfigController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly envConfig: DiscordGatewayConfig,
    @Inject(TECHNIKA_CONFIG_STORE_TOKEN) private readonly store: VersionedConfigStore,
    @Optional()
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null = null,
  ) {}

  /** Current Technika snapshot. Draft is shown when present; runtime stays on active until Apply. */
  @Get()
  public getActive(): ReturnType<VersionedConfigStore['getActiveSnapshot']> & {
    readonly strictGuildIsolation: boolean;
  } {
    const snap = this.store.getDraftSnapshot() ?? this.store.getActiveSnapshot();
    return {
      ...snap,
      strictGuildIsolation: this.envConfig.DISCORD_STRICT_GUILD_ISOLATION,
    };
  }

  @Put('draft')
  public putDraft(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
  ): {
    readonly ok: boolean;
    readonly revision: number;
    readonly status: 'draft' | 'active';
    readonly config: unknown;
    readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>;
    readonly updatedAt: string;
  } {
    this.requireSecret(secret);
    const payload =
      body !== null && typeof body === 'object' && !Array.isArray(body) && 'config' in body
        ? (body as { config: unknown }).config
        : body;
    const result = this.store.putDraft(payload);
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
      revision: draft?.revision ?? this.store.getActiveSnapshot().revision,
      status: 'draft',
      config: result.config,
      issues: [],
      updatedAt: draft?.updatedAt ?? this.store.getActiveSnapshot().updatedAt,
    };
  }

  @Post('validate')
  public validate(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
  ): {
    readonly ok: boolean;
    readonly config: unknown;
    readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  } {
    this.requireSecret(secret);
    const hasBody =
      body !== undefined &&
      body !== null &&
      !(typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0);
    let input: unknown = undefined;
    if (hasBody) {
      input =
        typeof body === 'object' && body !== null && !Array.isArray(body) && 'config' in body
          ? (body as { config: unknown }).config
          : body;
    }
    const result = this.store.validate(input);
    if (!result.ok) {
      return { ok: false, config: null, issues: result.issues };
    }
    return { ok: true, config: result.config, issues: [] };
  }

  @Post('preview')
  public preview(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
  ): ReturnType<VersionedConfigStore['preview']> {
    this.requireSecret(secret);
    return this.store.preview();
  }

  @Post('apply')
  public apply(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
  ): ReturnType<VersionedConfigStore['getActiveSnapshot']> & { readonly ok: true } {
    this.requireSecret(secret);
    try {
      const snap = this.store.apply();
      return { ok: true, ...snap };
    } catch (error) {
      if (error instanceof ApplyValidationError) {
        throw new BadRequestException({
          ok: false,
          error: 'validation_failed',
          issues: error.issues,
        });
      }
      throw error;
    }
  }

  @Post('rollback')
  public rollback(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
  ): ReturnType<VersionedConfigStore['getActiveSnapshot']> & { readonly ok: true } {
    this.requireSecret(secret);
    try {
      const snap = this.store.rollback();
      return { ok: true, ...snap };
    } catch (error) {
      if (error instanceof RollbackUnavailableError) {
        throw new ConflictException({
          ok: false,
          error: 'rollback_unavailable',
          hint: 'Brak poprzedniej rewizji do cofnięcia.',
        });
      }
      throw error;
    }
  }

  /**
   * Send a one-off test DM using draft (if any) or active templates.
   * Optional body overrides let Technika preview the form textarea before apply.
   */
  @Post('test-dm')
  public async testDm(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{
    readonly ok: true;
    readonly delivery: 'dm';
    readonly messageId: string;
    readonly module: TestDmModule;
    readonly discordUserId: string;
  }> {
    this.requireSecret(secret);

    const gateway = this.gateway;
    if (!gateway) {
      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_gateway_offline',
        hint: 'Bot Discord nie jest online — uruchom discord-gateway z DISCORD_ENABLED=true.',
      });
    }

    const parsed = this.parseTestDmBody(body);
    const cfg = this.resolveConfigForTest(parsed);
    const discordUserId = this.resolveTestUserId(parsed.discordUserId);

    let content: string;
    let components: Parameters<DiscordJsGatewayAdapter['sendTimerNotify']>[0]['components'];

    if (parsed.module === 'kingdomWar') {
      const war = {
        ...cfg.kingdomWar,
        ...(parsed.messageTemplate
          ? { messageTemplate: parsed.messageTemplate }
          : {}),
        ...(parsed.warAt ? { warAt: parsed.warAt } : {}),
        ...(parsed.notifyMinutesBefore !== undefined
          ? { notifyMinutesBefore: parsed.notifyMinutesBefore }
          : {}),
      };
      if (!war.messageTemplate.trim()) {
        throw new BadRequestException({
          ok: false,
          error: 'empty_template',
          hint: 'Wpisz treść wiadomości o wojnie.',
        });
      }
      const rendered = renderKingdomWarReminder({
        config: war,
        signingSecret: this.envConfig.DISCORD_COMPONENT_SIGNING_SECRET,
      });
      content = `**[TEST Technika]**\n${rendered.content ?? ''}`.slice(0, 1900);
      components = rendered.components;
    } else {
      const timers = {
        ...cfg.timersNotify,
        ...(parsed.messageTemplate
          ? { messageTemplate: parsed.messageTemplate }
          : {}),
        ...(parsed.reminderMinutesBefore !== undefined
          ? { reminderMinutesBefore: parsed.reminderMinutesBefore }
          : {}),
      };
      if (!timers.messageTemplate.trim()) {
        throw new BadRequestException({
          ok: false,
          error: 'empty_template',
          hint: 'Wpisz treść wiadomości timerów postaci.',
        });
      }
      const filled = applyMessageTemplate(timers.messageTemplate, {
        title: 'Ksiega umiejetnosci · Oak',
        body: 'To jest testowa PW z Technika — timer postaci (EQ/Timer), nie mapa/metin.',
        characterName: 'Oak',
        timerLabel: 'Ksiega umiejetnosci',
        endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        otherTimersSummary: 'Oak · Kamien Duchowy — gotowe; Oak · Jazda konna — 23 h',
        deepLinkUrl: 'http://127.0.0.1:3000/teams/demo/characters/char-1?view=timers',
        minutes: timers.reminderMinutesBefore,
        reminderMinutesBefore: timers.reminderMinutesBefore,
      });
      content = `**[TEST Technika · Timery postaci]**\n${filled}`.slice(0, 1900);
      components = undefined;
    }

    try {
      const sent = await gateway.sendTimerNotify({
        discordUserId,
        content,
        ...(components && components.length > 0 ? { components } : {}),
      });
      return {
        ok: true,
        delivery: 'dm',
        messageId: sent.messageId,
        module: parsed.module,
        discordUserId,
      };
    } catch (error) {
      if (error instanceof NotifyDmClosedError) {
        throw new BadRequestException({
          ok: false,
          error: 'dms_closed',
          hint: 'Odbiorca ma zamknięte PW od bota — otwórz DM lub wybierz innego operatora.',
          discordUserId,
        });
      }
      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_send_failed',
        detail: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private parseTestDmBody(body: unknown): {
    readonly module: TestDmModule;
    readonly discordUserId?: string;
    readonly messageTemplate?: string;
    readonly reminderMinutesBefore?: number;
    readonly warAt?: string;
    readonly notifyMinutesBefore?: number;
  } {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException({
        ok: false,
        error: 'invalid_body',
        hint: 'Oczekiwano JSON: { module: "timersNotify"|"characterTimers"|"kingdomWar", ... }',
      });
    }
    const record = body as Record<string, unknown>;
    const rawModule = record.module;
    if (
      rawModule !== 'timersNotify' &&
      rawModule !== 'characterTimers' &&
      rawModule !== 'kingdomWar'
    ) {
      throw new BadRequestException({
        ok: false,
        error: 'invalid_module',
        hint: 'module musi być timersNotify, characterTimers albo kingdomWar.',
      });
    }
    const discordUserId =
      typeof record.discordUserId === 'string' && record.discordUserId.trim().length > 0
        ? record.discordUserId.trim()
        : undefined;
    if (discordUserId && !/^\d{17,20}$/.test(discordUserId)) {
      throw new BadRequestException({
        ok: false,
        error: 'invalid_discord_user_id',
        hint: 'discordUserId musi być snowflake Discord (17–20 cyfr).',
      });
    }
    return {
      module: rawModule,
      ...(discordUserId ? { discordUserId } : {}),
      ...(typeof record.messageTemplate === 'string'
        ? { messageTemplate: record.messageTemplate }
        : {}),
      ...(typeof record.reminderMinutesBefore === 'number'
        ? { reminderMinutesBefore: record.reminderMinutesBefore }
        : {}),
      ...(typeof record.warAt === 'string' ? { warAt: record.warAt } : {}),
      ...(typeof record.notifyMinutesBefore === 'number'
        ? { notifyMinutesBefore: record.notifyMinutesBefore }
        : {}),
    };
  }

  private resolveConfigForTest(parsed: {
    readonly module: TestDmModule;
  }): BotConfigValues {
    const draft = this.store.getDraftSnapshot();
    if (draft) {
      return draft.config;
    }
    return this.store.getActiveSnapshot().config;
  }

  private resolveTestUserId(override: string | undefined): string {
    if (override) {
      return override;
    }
    const operators = parseOperatorIds(this.envConfig.DISCORD_TEST_OPERATOR_IDS);
    if (operators[0]) {
      return operators[0];
    }
    throw new BadRequestException({
      ok: false,
      error: 'no_test_recipient',
      hint:
        'Podaj discordUserId w body albo ustaw DISCORD_TEST_OPERATOR_IDS na bramce (pierwszy ID dostanie testową PW).',
    });
  }

  private requireSecret(secret: string | undefined): void {
    assertTechnikaSecret(secret, this.envConfig.DISCORD_TECHNIKA_SHARED_SECRET);
  }
}
