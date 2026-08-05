import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  type GuildBasedChannel,
  type Interaction,
} from 'discord.js';

import type {
  GatewayClientPort,
  GatewayHealthSnapshot,
  GatewayRestPort,
  GuildCommandDefinition,
} from '../../application/ports/gateway.ports.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import { redactSecrets, safeErrorMessage } from '../security/secret-redaction.js';

export type DiscordClientLifecycleDeps = {
  config: DiscordGatewayConfig;
  onInteraction: (interaction: Interaction) => Promise<void>;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
};

const REQUIRED_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

const REQUIRED_PERMISSION_NAMES = [
  'ViewChannel',
  'SendMessages',
  'EmbedLinks',
  'ReadMessageHistory',
] as const;

export class DiscordJsGatewayAdapter implements GatewayClientPort, GatewayRestPort {
  private readonly client: Client;
  private readonly rest: REST;
  private state: GatewayHealthSnapshot['state'] = 'disabled';
  private startedAt = Date.now();
  private commandsRegistered = false;
  private isolationOk = true;
  private lastError: string | null = null;
  private readonly secrets: string[];

  public constructor(private readonly deps: DiscordClientLifecycleDeps) {
    this.secrets = [deps.config.DISCORD_TOKEN, deps.config.DISCORD_COMPONENT_SIGNING_SECRET].filter(
      (value) => value.length > 0,
    );

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
    this.rest = new REST({ version: '10' }).setToken(deps.config.DISCORD_TOKEN);
    this.bindEvents();
  }

  public getState() {
    return this.state;
  }

  public getSnapshot(): GatewayHealthSnapshot {
    return {
      state: this.state,
      enabled: this.deps.config.DISCORD_ENABLED,
      guildId: this.deps.config.DISCORD_TEST_GUILD_ID,
      pingMs: this.client.ws.ping >= 0 ? Math.round(this.client.ws.ping) : null,
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000)),
      commandsRegistered: this.commandsRegistered,
      isolationOk: this.isolationOk,
      lastError: this.lastError,
    };
  }

  public markCommandsRegistered(value: boolean): void {
    this.commandsRegistered = value;
  }

  public async start(): Promise<void> {
    if (!this.deps.config.DISCORD_ENABLED) {
      this.state = 'disabled';
      return;
    }

    this.state = 'connecting';
    this.startedAt = Date.now();

    const timeout = setTimeout(() => {
      this.state = 'failed';
      this.lastError = 'Discord startup timed out.';
    }, this.deps.config.DISCORD_STARTUP_TIMEOUT_MS);

    try {
      await this.client.login(this.deps.config.DISCORD_TOKEN);
      await this.assertGuildMembershipAndIsolation();
      this.state = 'ready';
      this.deps.logger.info('Discord gateway ready', {
        guildId: this.deps.config.DISCORD_TEST_GUILD_ID,
      });
    } catch (error) {
      this.state = 'failed';
      this.lastError = safeErrorMessage(error, this.secrets);
      this.deps.logger.error('Discord gateway failed to start', {
        error: this.lastError,
      });
      throw new Error(this.lastError);
    } finally {
      clearTimeout(timeout);
    }
  }

  public async stop(): Promise<void> {
    this.state = 'stopping';
    await Promise.resolve(this.client.destroy());
    this.state = 'disabled';
  }

  public async fetchApplication() {
    const app = await this.rest.get(Routes.oauth2CurrentApplication());
    const record = app as { id: string; name: string; bot?: { id: string } };
    return {
      id: record.id,
      name: record.name,
      // Discord bot applications expose the bot user under `bot`; fall back to app id.
      botUserId: record.bot?.id ?? record.id,
    };
  }

  public async fetchGuild(guildId: string) {
    // Bot tokens can only GET a guild when the bot is a member of that guild.
    const guild = await this.rest.get(Routes.guild(guildId));
    const record = guild as { id: string; name: string };

    let botIsMember = true;
    const application = await this.fetchApplication().catch(() => null);
    if (application !== null && application.botUserId !== 'unknown') {
      try {
        await this.rest.get(Routes.guildMember(guildId, application.botUserId));
        botIsMember = true;
      } catch {
        // Guild GET already implies membership for bot tokens; keep true unless GET failed.
        botIsMember = true;
      }
    }

    return { id: record.id, name: record.name, botIsMember };
  }

  public async listGuildCommands(guildId: string) {
    const commands = (await this.rest.get(
      Routes.applicationGuildCommands(this.deps.config.DISCORD_APPLICATION_ID, guildId),
    )) as Array<{ id: string; name: string }>;
    return commands.map((command) => ({ id: command.id, name: command.name }));
  }

  public async listGlobalCommands() {
    const commands = (await this.rest.get(
      Routes.applicationCommands(this.deps.config.DISCORD_APPLICATION_ID),
    )) as Array<{ id: string; name: string }>;
    return commands.map((command) => ({ id: command.id, name: command.name }));
  }

  public async putGuildCommands(guildId: string, commands: GuildCommandDefinition[]) {
    const body = commands.map((command) => ({
      name: command.name,
      description: command.description,
    }));
    const route = Routes.applicationGuildCommands(this.deps.config.DISCORD_APPLICATION_ID, guildId);
    if (!route.includes('/guilds/')) {
      throw new Error('Refusing non-guild command registration route.');
    }

    const result = (await this.rest.put(route, { body })) as Array<{ id: string; name: string }>;
    this.commandsRegistered = true;
    return result.map((command) => ({ id: command.id, name: command.name }));
  }

  public async checkChannelPermissions(guildId: string, channelId: string) {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || channel.type === ChannelType.DM) {
      return { ok: false, missing: [...REQUIRED_PERMISSION_NAMES] };
    }

    const guildChannel = channel as GuildBasedChannel;
    if (guildChannel.guildId !== guildId) {
      return { ok: false, missing: [...REQUIRED_PERMISSION_NAMES] };
    }

    const me = guildChannel.guild.members.me;
    if (!me) {
      return { ok: false, missing: [...REQUIRED_PERMISSION_NAMES] };
    }

    const permissions = guildChannel.permissionsFor(me);
    const missing: string[] = [];
    for (const [index, flag] of REQUIRED_CHANNEL_PERMISSIONS.entries()) {
      if (!permissions?.has(flag)) {
        missing.push(REQUIRED_PERMISSION_NAMES[index] ?? 'Unknown');
      }
    }
    return { ok: missing.length === 0, missing };
  }

  private bindEvents(): void {
    this.client.once(Events.ClientReady, () => {
      this.deps.logger.info('Discord client ready event received');
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.deps.onInteraction(interaction).catch((error: unknown) => {
        this.deps.logger.error('Unhandled interaction error', {
          error: safeErrorMessage(error, this.secrets),
          interactionId: interaction.id,
          guildId: interaction.guildId,
          userId: interaction.user.id,
        });
      });
    });

    this.client.on(Events.GuildCreate, (guild) => {
      void this.handleUnauthorizedGuild(guild.id, 'guildCreate');
    });

    this.client.on(Events.Error, (error) => {
      this.state = 'degraded';
      this.lastError = safeErrorMessage(error, this.secrets);
      this.deps.logger.error('Discord client error', { error: this.lastError });
    });

    this.client.on(Events.Warn, (message) => {
      this.deps.logger.warn('Discord client warning', {
        message: redactSecrets(message, this.secrets),
      });
    });

    this.client.on(Events.ShardError, (error) => {
      this.state = 'degraded';
      this.lastError = safeErrorMessage(error, this.secrets);
      this.deps.logger.error('Discord shard error', { error: this.lastError });
    });

    this.client.on(Events.Invalidated, () => {
      this.state = 'failed';
      this.lastError = 'Discord session invalidated.';
      this.deps.logger.error('Discord session invalidated');
    });
  }

  private async assertGuildMembershipAndIsolation(): Promise<void> {
    const allowed = this.deps.config.DISCORD_TEST_GUILD_ID;
    const guilds = [...this.client.guilds.cache.values()];
    const memberOfAllowed = guilds.some((guild) => guild.id === allowed);

    if (!memberOfAllowed) {
      this.isolationOk = false;
      throw new Error(`Bot is not a member of the configured test guild ${allowed}.`);
    }

    const foreign = guilds.filter((guild) => guild.id !== allowed);
    if (foreign.length > 0 && this.deps.config.DISCORD_STRICT_GUILD_ISOLATION) {
      this.isolationOk = false;
      this.state = 'failed';
      for (const guild of foreign) {
        this.deps.logger.error('Unauthorized guild membership detected', {
          guildId: guild.id,
        });
        await guild.leave();
      }
      throw new Error('Strict guild isolation failed: bot present on unauthorized guilds.');
    }

    this.isolationOk = true;
  }

  private async handleUnauthorizedGuild(guildId: string, source: string): Promise<void> {
    if (guildId === this.deps.config.DISCORD_TEST_GUILD_ID) {
      return;
    }

    this.deps.logger.error('Unauthorized guild event', { guildId, source });
    if (!this.deps.config.DISCORD_STRICT_GUILD_ISOLATION) {
      return;
    }

    this.isolationOk = false;
    this.state = 'failed';
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      await guild.leave();
    }
    this.deps.logger.error('Process terminating due to unauthorized guild membership', {
      guildId,
    });
    process.exitCode = 1;
    await this.stop();
  }
}

export function assertOnlyGuildsIntent(intents: readonly number[]): void {
  if (intents.length !== 1 || intents[0] !== GatewayIntentBits.Guilds) {
    throw new Error('Only GatewayIntentBits.Guilds is permitted.');
  }
}
