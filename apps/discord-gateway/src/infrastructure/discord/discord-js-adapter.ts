import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Interaction,
  type MessageCreateOptions,
} from 'discord.js';
import { createHash } from 'node:crypto';

import type { AuthorizationSyncPort } from '../../application/ports/authorization-sync.port.js';
import type {
  GatewayClientPort,
  GatewayHealthSnapshot,
  GatewayRestPort,
  GuildCommandDefinition,
} from '../../application/ports/gateway.ports.js';
import {
  createAuthorizationSyncClient,
  hashAuthzPayload,
} from '../authorization/authorization-sync-client.js';
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
  authorizationSync?: AuthorizationSyncPort | null;
  /**
   * Extra guild snowflakes allowed for runtime (authz sync / panels).
   * Always includes DISCORD_TEST_GUILD_ID. Discovery lists ALL joined guilds.
   */
  getRuntimeAllowedGuildIds?: () => readonly string[];
  memberActivityCollector?: {
    handleMessageCreate(message: import('discord.js').Message): void;
    handleVoiceStateUpdate(
      before: import('discord.js').VoiceState,
      after: import('discord.js').VoiceState,
    ): void;
    flushAllOpenSessions(): void;
  } | null;
};

const REQUIRED_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

const REQUIRED_PERMISSION_NAMES = [
  'ViewChannel',
  'SendMessages',
  'EmbedLinks',
  'AttachFiles',
  'ReadMessageHistory',
] as const;

const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
] as const;
const SYNC_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
] as const;

/** Discord REST/API: Cannot send messages to this user (DMs closed / no shared guild). */
export function isDiscordDmClosedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = 'code' in error ? (error).code : undefined;
  if (code === 50007 || code === '50007') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /cannot send messages to this user/i.test(message);
}

export class NotifyDmClosedError extends Error {
  public readonly code = 'dms_closed' as const;

  public constructor(message = 'Discord DMs closed for this user.') {
    super(message);
    this.name = 'NotifyDmClosedError';
  }
}

export class DiscordJsGatewayAdapter implements GatewayClientPort, GatewayRestPort {
  private readonly client: Client;
  private readonly rest: REST;
  private state: GatewayHealthSnapshot['state'] = 'disabled';
  private startedAt = Date.now();
  private commandsRegistered = false;
  private isolationOk = true;
  private lastError: string | null = null;
  private readonly secrets: string[];
  private readonly authorizationSync: AuthorizationSyncPort | null;

  public constructor(private readonly deps: DiscordClientLifecycleDeps) {
    this.secrets = [
      deps.config.DISCORD_TOKEN,
      deps.config.DISCORD_COMPONENT_SIGNING_SECRET,
      deps.config.DISCORD_NOTIFY_SHARED_SECRET,
    ].filter((value) => value.length > 0);
    this.authorizationSync =
      deps.authorizationSync === undefined
        ? createAuthorizationSyncClient(deps.config, deps.logger)
        : deps.authorizationSync;

    const intents = deps.config.DISCORD_AUTHORIZATION_SYNC_ENABLED
      ? [...SYNC_INTENTS]
      : [...BASE_INTENTS];
    assertAllowedGatewayIntents(intents, deps.config.DISCORD_AUTHORIZATION_SYNC_ENABLED);

    this.client = new Client({
      intents,
    });
    this.rest = new REST({ version: '10' }).setToken(deps.config.DISCORD_TOKEN);
    this.bindEvents();
  }

  public getState() {
    return this.state;
  }

  public getSnapshot(): GatewayHealthSnapshot {
    const joined = this.listJoinedGuildSummaries();
    return {
      state: this.state,
      enabled: this.deps.config.DISCORD_ENABLED,
      guildId: this.deps.config.DISCORD_TEST_GUILD_ID,
      pingMs: this.client.ws.ping >= 0 ? Math.round(this.client.ws.ping) : null,
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000)),
      commandsRegistered: this.commandsRegistered,
      isolationOk: this.isolationOk,
      lastError: this.lastError,
      joinedGuildCount: joined.length,
      joinedGuildIds: joined.map((g) => g.id),
      guildCacheSize: this.client.guilds.cache.size,
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
      await this.syncAllowedGuildOnReady();
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
      botUserId: record.bot?.id ?? record.id,
    };
  }

  /** REST/cache merge so Technika lists every joined guild (not only TEST). */
  private joinedGuildRestCache: Array<{
    id: string;
    name: string;
    memberCount: number | null;
  }> = [];

  /** Technika discovery: guilds the bot is a member of (cache âŞ last REST refresh). */
  public listJoinedGuildSummaries(): ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly memberCount: number | null;
  }> {
    const byId = new Map<string, { id: string; name: string; memberCount: number | null }>();
    for (const g of this.joinedGuildRestCache) {
      byId.set(g.id, g);
    }
    for (const guild of this.client.guilds.cache.values()) {
      byId.set(guild.id, {
        id: guild.id,
        name: guild.name,
        memberCount: typeof guild.memberCount === 'number' ? guild.memberCount : null,
      });
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Refresh discovery from gateway guild cache, then best-effort resolve extra IDs
   * (configured Technika guilds) via cache / guilds.fetch / REST GET /guilds/{id}.
   * Read-only â€” never leaves, enables, publishes, or sends.
   * Note: Bot tokens cannot call GET /users/@me/guilds (403) â€” membership is gateway-only.
   */
  public async refreshJoinedGuildDirectory(extraGuildIds: readonly string[] = []): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly memberCount: number | null;
    }>
  > {
    const byId = new Map<string, { id: string; name: string; memberCount: number | null }>();
    for (const guild of this.client.guilds.cache.values()) {
      byId.set(guild.id, {
        id: guild.id,
        name: guild.name,
        memberCount: typeof guild.memberCount === 'number' ? guild.memberCount : null,
      });
    }

    const missing = [
      ...new Set(
        extraGuildIds
          .map((id) => id.trim())
          .filter((id) => /^\d{17,20}$/.test(id) && !byId.has(id)),
      ),
    ];

    for (const guildId of missing) {
      try {
        const fetched = await this.client.guilds.fetch(guildId);
        byId.set(fetched.id, {
          id: fetched.id,
          name: fetched.name,
          memberCount: typeof fetched.memberCount === 'number' ? fetched.memberCount : null,
        });
        continue;
      } catch {
        // not in gateway cache / fetch failed â€” try REST guild endpoint (bot must be member)
      }
      try {
        const record = (await this.rest.get(Routes.guild(guildId))) as {
          id?: string;
          name?: string;
          approximate_member_count?: number;
        };
        if (
          typeof record.id === 'string' &&
          typeof record.name === 'string' &&
          record.name.trim()
        ) {
          byId.set(record.id, {
            id: record.id,
            name: record.name,
            memberCount:
              typeof record.approximate_member_count === 'number'
                ? record.approximate_member_count
                : null,
          });
        }
      } catch (error) {
        this.deps.logger.warn('Failed to resolve guild display name for discovery', {
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.joinedGuildRestCache = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    this.deps.logger.info('Joined guild directory refreshed', {
      count: this.joinedGuildRestCache.length,
      guildIds: this.joinedGuildRestCache.map((g) => g.id),
      names: this.joinedGuildRestCache.map((g) => ({ id: g.id, name: g.name })),
      resolvedExtra: missing.length,
    });
    return this.listJoinedGuildSummaries();
  }

  public async fetchGuild(guildId: string) {
    const guild = await this.rest.get(Routes.guild(guildId));
    const record = guild as { id: string; name: string };

    let botIsMember = true;
    const application = await this.fetchApplication().catch(() => null);
    if (application !== null && application.botUserId !== 'unknown') {
      try {
        await this.rest.get(Routes.guildMember(guildId, application.botUserId));
        botIsMember = true;
      } catch {
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

  public async sendTimerNotify(input: {
    readonly discordUserId: string;
    readonly discordChannelId?: string;
    readonly content: string;
    readonly components?: MessageCreateOptions['components'];
  }): Promise<{ readonly delivery: 'dm' | 'channel'; readonly messageId: string }> {
    const messageOptions: MessageCreateOptions = {
      content: input.content,
      ...(input.components && input.components.length > 0 ? { components: input.components } : {}),
    };

    if (input.discordChannelId) {
      const channel = await this.client.channels.fetch(input.discordChannelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        throw new Error('Notify channel is missing or not a guild text channel.');
      }
      const guildChannel = channel as GuildBasedChannel & {
        send(options: MessageCreateOptions): Promise<{ id: string }>;
      };
      if (guildChannel.guildId !== this.deps.config.DISCORD_TEST_GUILD_ID) {
        throw new Error('Refusing notify outside configured test guild.');
      }
      const message = await guildChannel.send(messageOptions);
      return { delivery: 'channel', messageId: message.id };
    }

    const user = await this.client.users.fetch(input.discordUserId);
    try {
      const message = await user.send(messageOptions);
      return { delivery: 'dm', messageId: message.id };
    } catch (error) {
      if (isDiscordDmClosedError(error)) {
        throw new NotifyDmClosedError();
      }
      throw error;
    }
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

  /** Technika panels: list guild text channels + bot publish permission. */
  public async listGuildTextChannels(guildId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly type: number;
      readonly canPublish: boolean;
    }>
  > {
    this.assertPanelGuildHardStop(guildId);
    const guild = await this.client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const out: Array<{ id: string; name: string; type: number; canPublish: boolean }> = [];
    for (const channel of channels.values()) {
      if (!channel || channel.type !== ChannelType.GuildText) continue;
      const perms = await this.checkChannelPermissions(guildId, channel.id);
      out.push({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        canPublish: perms.ok,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Technika: list guild roles (read-only; no prod publish hard-stop). */
  public async listGuildRoles(
    guildId: string,
  ): Promise<ReadonlyArray<{ readonly id: string; readonly name: string }>> {
    const guild = await this.client.guilds.fetch(guildId);
    await guild.roles.fetch();
    return [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .map((role) => ({ id: role.id, name: role.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Technika panels: recent messages authored by this bot that look like panels. */
  public async listRecentBotPanels(
    guildId: string,
    channelId: string,
  ): Promise<
    ReadonlyArray<{
      readonly messageId: string;
      readonly isComponentsV2: boolean;
      readonly jumpUrl: string;
    }>
  > {
    this.assertPanelGuildHardStop(guildId);
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Channel missing or not a guild text channel.');
    }
    const guildChannel = channel as GuildBasedChannel & {
      messages: {
        fetch(options: {
          limit: number;
        }): Promise<
          Map<string, { id: string; author: { id: string }; flags: { bitfield: number } }>
        >;
      };
      guildId: string;
    };
    if (guildChannel.guildId !== guildId) {
      throw new Error('Channel does not belong to guild.');
    }
    const me = this.client.user?.id;
    if (!me) {
      throw new Error('Discord client user unavailable.');
    }
    const recent = await guildChannel.messages.fetch({ limit: 30 });
    const panels: Array<{ messageId: string; isComponentsV2: boolean; jumpUrl: string }> = [];
    for (const message of recent.values()) {
      if (message.author.id !== me) continue;
      const isComponentsV2 = (message.flags.bitfield & 32768) === 32768;
      panels.push({
        messageId: message.id,
        isComponentsV2,
        jumpUrl: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`,
      });
    }
    return panels;
  }

  /** Technika panels: publish Components V2 lab panel (TEST guild only). */
  public async publishGuildPanel(input: {
    readonly guildId: string;
    readonly channelId: string;
    readonly message: MessageCreateOptions;
  }): Promise<{ readonly messageId: string }> {
    this.assertPanelGuildHardStop(input.guildId);
    if (input.guildId !== this.deps.config.DISCORD_TEST_GUILD_ID) {
      throw new Error('Refusing panel publish outside configured test guild.');
    }
    const channel = await this.client.channels.fetch(input.channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Publish channel missing or not a guild text channel.');
    }
    const guildChannel = channel as GuildBasedChannel & {
      send(options: MessageCreateOptions): Promise<{ id: string }>;
      guildId: string;
    };
    if (guildChannel.guildId !== input.guildId) {
      throw new Error('Publish channel does not belong to guild.');
    }
    const message = await guildChannel.send(input.message);
    return { messageId: message.id };
  }

  /** Technika panels: edit/refresh bot panel message in-place (TEST guild only). */
  public async refreshGuildPanelMessage(input: {
    readonly guildId: string;
    readonly channelId: string;
    readonly messageId: string;
    readonly message: MessageCreateOptions;
  }): Promise<void> {
    this.assertPanelGuildHardStop(input.guildId);
    if (input.guildId !== this.deps.config.DISCORD_TEST_GUILD_ID) {
      throw new Error('Refusing panel refresh outside configured test guild.');
    }
    const channel = await this.client.channels.fetch(input.channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Refresh channel missing or not a guild text channel.');
    }
    const guildChannel = channel as GuildBasedChannel & {
      messages: {
        edit(
          id: string,
          options: MessageCreateOptions & { flags?: number | bigint },
        ): Promise<unknown>;
      };
      guildId: string;
    };
    if (guildChannel.guildId !== input.guildId) {
      throw new Error('Refresh channel does not belong to guild.');
    }
    await guildChannel.messages.edit(input.messageId, {
      ...input.message,
      content: input.message.content ?? '',
      embeds: [],
      flags: typeof input.message.flags === 'number' ? input.message.flags : 32768,
    });
  }

  /** Technika panels: delete bot panel message (TEST guild only). */
  public async deleteGuildPanelMessage(input: {
    readonly guildId: string;
    readonly channelId: string;
    readonly messageId: string;
  }): Promise<void> {
    this.assertPanelGuildHardStop(input.guildId);
    if (input.guildId !== this.deps.config.DISCORD_TEST_GUILD_ID) {
      throw new Error('Refusing panel delete outside configured test guild.');
    }
    const channel = await this.client.channels.fetch(input.channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Delete channel missing or not a guild text channel.');
    }
    const guildChannel = channel as GuildBasedChannel & {
      messages: { delete(id: string): Promise<unknown> };
      guildId: string;
    };
    if (guildChannel.guildId !== input.guildId) {
      throw new Error('Delete channel does not belong to guild.');
    }
    await guildChannel.messages.delete(input.messageId);
  }

  private assertPanelGuildHardStop(guildId: string): void {
    if (guildId === '1543972927719080016' || guildId === '1531318787058696424') {
      throw new Error('prod_guild_hard_stop');
    }
  }

  private bindEvents(): void {
    this.client.once(Events.ClientReady, () => {
      const cacheSize = this.client.guilds.cache.size;
      const cacheIds = [...this.client.guilds.cache.keys()];
      this.deps.logger.info('Discord client ready event received', {
        guildCacheSize: cacheSize,
        guildCacheIds: cacheIds,
        applicationId: this.deps.config.DISCORD_APPLICATION_ID,
        botUserId: this.client.user?.id ?? null,
      });
      void this.refreshJoinedGuildDirectory().then((joined) => {
        this.deps.logger.info('Post-ready joined guild directory', {
          count: joined.length,
          guildIds: joined.map((g) => g.id),
          names: joined.map((g) => ({ id: g.id, name: g.name })),
        });
      });
    });

    this.client.on(Events.MessageCreate, (message) => {
      try {
        this.deps.memberActivityCollector?.handleMessageCreate(message);
      } catch (error: unknown) {
        this.deps.logger.error('memberActivity MessageCreate failed', {
          error: safeErrorMessage(error, this.secrets),
        });
      }
    });

    this.client.on(Events.VoiceStateUpdate, (before, after) => {
      try {
        this.deps.memberActivityCollector?.handleVoiceStateUpdate(before, after);
      } catch (error: unknown) {
        this.deps.logger.error('memberActivity VoiceStateUpdate failed', {
          error: safeErrorMessage(error, this.secrets),
        });
      }
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
      void this.handleGuildCreate(guild).catch((error: unknown) => {
        this.deps.logger.error('GuildCreate handler failed', {
          guildId: guild.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildDelete, (guild) => {
      void this.handleGuildDelete(guild).catch((error: unknown) => {
        this.deps.logger.error('GuildDelete handler failed', {
          guildId: guild.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildMemberAdd, (member) => {
      void this.handleMemberUpsert(member, 'guild_member_add').catch((error: unknown) => {
        this.deps.logger.error('GuildMemberAdd sync failed', {
          guildId: member.guild.id,
          userId: member.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildMemberRemove, (member) => {
      void this.handleMemberRemove(member).catch((error: unknown) => {
        this.deps.logger.error('GuildMemberRemove sync failed', {
          guildId: member.guild.id,
          userId: member.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildMemberUpdate, (_previous, member) => {
      void this.handleMemberUpsert(member, 'guild_member_update').catch((error: unknown) => {
        this.deps.logger.error('GuildMemberUpdate sync failed', {
          guildId: member.guild.id,
          userId: member.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildRoleCreate, (role) => {
      void this.handleRolesChanged(role.guild, 'guild_role_create').catch((error: unknown) => {
        this.deps.logger.error('GuildRoleCreate sync failed', {
          guildId: role.guild.id,
          roleId: role.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildRoleUpdate, (_previous, role) => {
      void this.handleRolesChanged(role.guild, 'guild_role_update').catch((error: unknown) => {
        this.deps.logger.error('GuildRoleUpdate sync failed', {
          guildId: role.guild.id,
          roleId: role.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
    });

    this.client.on(Events.GuildRoleDelete, (role) => {
      void this.handleRolesChanged(role.guild, 'guild_role_delete').catch((error: unknown) => {
        this.deps.logger.error('GuildRoleDelete sync failed', {
          guildId: role.guild.id,
          roleId: role.id,
          error: safeErrorMessage(error, this.secrets),
        });
      });
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

  private runtimeAllowedGuildIds(): Set<string> {
    const ids = new Set<string>();
    const testId = this.deps.config.DISCORD_TEST_GUILD_ID?.trim();
    if (testId) ids.add(testId);
    for (const id of this.deps.getRuntimeAllowedGuildIds?.() ?? []) {
      const trimmed = id.trim();
      if (/^\d{17,20}$/.test(trimmed)) ids.add(trimmed);
    }
    return ids;
  }

  /** Runtime gate (panels/authz). Discovery keeps ALL joined guilds. */
  private isAllowedGuild(guildId: string): boolean {
    return this.runtimeAllowedGuildIds().has(guildId);
  }

  private async handleGuildCreate(guild: Guild): Promise<void> {
    // Never leave foreign guilds â€” Technika must list Destiled / Sojusz / TEST.
    // Strict isolation only gates runtime sync/actions below.
    if (!this.isAllowedGuild(guild.id)) {
      this.deps.logger.warn(
        'Joined guild outside runtime allowlist (kept for Technika discovery)',
        {
          guildId: guild.id,
          guildName: guild.name,
          source: 'guildCreate',
        },
      );
      void this.refreshJoinedGuildDirectory();
      return;
    }
    await this.registerAndReconcile(guild);
  }

  private async handleGuildDelete(guild: Guild): Promise<void> {
    if (!this.isAllowedGuild(guild.id) || this.authorizationSync === null) {
      return;
    }

    // GuildDelete fires both for a transient outage (guild.available === false)
    // and for a confirmed removal/disconnect. Only the latter is a real detach.
    // Occurrence identity for idempotency is owned by Authorization DB
    // generations; Gateway sends a stable transport key without process epochs.
    const unavailable = guild.available === false;
    const eventType = unavailable ? 'guild_unavailable' : 'guild_delete';
    const payload = unavailable
      ? ({ kind: 'guild_unavailable' } as const)
      : ({ kind: 'guild_detach' } as const);
    const eventKey = unavailable
      ? buildDiscordEventKey('guild_unavailable', [guild.id])
      : buildDiscordEventKey('guild_detach', [guild.id]);
    await this.authorizationSync.applyDiscordEvent({
      eventKey,
      eventType,
      discordGuildId: guild.id,
      payload,
      payloadHash: hashAuthzPayload(payload),
    });
  }

  private async handleMemberUpsert(
    member: GuildMember,
    eventType: 'guild_member_add' | 'guild_member_update',
  ): Promise<void> {
    if (!this.isAllowedGuild(member.guild.id) || this.authorizationSync === null) {
      return;
    }

    const roleIds = [...member.roles.cache.keys()].filter((id) => id !== member.guild.id);
    const payload = {
      kind: 'member_upsert' as const,
      member: {
        discordUserId: member.id,
        roleIds,
        status: 'active' as const,
      },
    };
    const joinedMs = member.joinedTimestamp ?? 0;
    const eventKey =
      eventType === 'guild_member_add'
        ? buildDiscordEventKey(eventType, [member.guild.id, member.id, joinedMs])
        : buildDiscordEventKey(eventType, [member.guild.id, member.id], {
            roleIds: [...roleIds].sort(),
            status: payload.member.status,
          });

    await this.authorizationSync.applyDiscordEvent({
      eventKey,
      eventType,
      discordGuildId: member.guild.id,
      payload,
      payloadHash: hashAuthzPayload(payload),
    });
  }

  private async handleMemberRemove(
    member: GuildMember | { id: string; guild: Guild },
  ): Promise<void> {
    if (!this.isAllowedGuild(member.guild.id) || this.authorizationSync === null) {
      return;
    }

    const payload = {
      kind: 'member_remove' as const,
      discordUserId: member.id,
    };
    // Transport key only â€” Authorization appends durable lifecycle_generation.
    const eventKey = buildDiscordEventKey('guild_member_remove', [member.guild.id, member.id]);
    await this.authorizationSync.applyDiscordEvent({
      eventKey,
      eventType: 'guild_member_remove',
      discordGuildId: member.guild.id,
      payload,
      payloadHash: hashAuthzPayload(payload),
    });
  }

  private async handleRolesChanged(
    guild: Guild,
    eventType: 'guild_role_create' | 'guild_role_update' | 'guild_role_delete',
  ): Promise<void> {
    if (!this.isAllowedGuild(guild.id) || this.authorizationSync === null) {
      return;
    }

    const roles = [...guild.roles.cache.values()]
      .filter((entry) => entry.id !== guild.id)
      .map((entry) => ({
        discordRoleId: entry.id,
        nameCache: entry.name,
      }));

    const payload = {
      kind: 'roles_snapshot' as const,
      roles,
    };
    const sortedRoles = [...roles].sort((a, b) => a.discordRoleId.localeCompare(b.discordRoleId));
    const eventKey = buildDiscordEventKey(eventType, [guild.id], sortedRoles);
    await this.authorizationSync.applyDiscordEvent({
      eventKey,
      eventType,
      discordGuildId: guild.id,
      payload,
      payloadHash: hashAuthzPayload(payload),
    });
  }

  private async syncAllowedGuildOnReady(): Promise<void> {
    if (this.authorizationSync === null) {
      return;
    }
    const guild = this.client.guilds.cache.get(this.deps.config.DISCORD_TEST_GUILD_ID);
    if (!guild) {
      return;
    }
    await this.registerAndReconcile(guild);
  }

  private async registerAndReconcile(guild: Guild): Promise<void> {
    if (this.authorizationSync === null) {
      return;
    }

    // Reconnect / (re)register: Authorization advances attachment_generation on
    // registerGuild conflict; Gateway does not own occurrence identity.
    await this.authorizationSync.registerGuild(guild.id);
    const snapshot = await this.buildGuildSnapshot(guild);
    const sortedMembers = [...snapshot.members].sort((a, b) =>
      a.discordUserId.localeCompare(b.discordUserId),
    );
    const sortedRoles = [...snapshot.roles].sort((a, b) =>
      a.discordRoleId.localeCompare(b.discordRoleId),
    );
    await this.authorizationSync.reconcileGuild(guild.id, {
      ...snapshot,
      eventKey: buildDiscordEventKey('reconcile', [guild.id], {
        members: sortedMembers,
        roles: sortedRoles,
      }),
    });
    this.deps.logger.info('Authorization sync register+reconcile completed', {
      guildId: guild.id,
      memberCount: snapshot.members.length,
      roleCount: snapshot.roles.length,
    });
  }

  private async buildGuildSnapshot(guild: Guild): Promise<{
    members: Array<{
      discordUserId: string;
      roleIds: string[];
      status: 'active';
    }>;
    roles: Array<{ discordRoleId: string; nameCache: string }>;
  }> {
    await guild.members.fetch();
    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .map((role) => ({
        discordRoleId: role.id,
        nameCache: role.name,
      }));

    const members = [...guild.members.cache.values()].map((member) => ({
      discordUserId: member.id,
      roleIds: [...member.roles.cache.keys()].filter((id) => id !== guild.id),
      status: 'active' as const,
    }));

    return { members, roles };
  }

  private async assertGuildMembershipAndIsolation(): Promise<void> {
    const primary = this.deps.config.DISCORD_TEST_GUILD_ID;
    await this.refreshJoinedGuildDirectory();
    const joined = this.listJoinedGuildSummaries();
    const memberOfPrimary = joined.some((guild) => guild.id === primary);

    if (!memberOfPrimary) {
      this.isolationOk = false;
      throw new Error(`Bot is not a member of the configured test guild ${primary}.`);
    }

    const runtime = this.runtimeAllowedGuildIds();
    const outsideRuntime = joined.filter((guild) => !runtime.has(guild.id));
    if (outsideRuntime.length > 0 && this.deps.config.DISCORD_STRICT_GUILD_ISOLATION) {
      // Keep membership for Technika GET /discord/v1/guilds; do not leave / do not exit.
      this.deps.logger.warn(
        'Strict isolation: extra joined guilds visible for discovery; runtime gated to allowlist',
        {
          primaryGuildId: primary,
          outsideRuntimeGuildIds: outsideRuntime.map((g) => g.id),
          runtimeAllowlist: [...runtime],
        },
      );
    }

    this.isolationOk = true;
  }

  private async handleUnauthorizedGuild(guildId: string, source: string): Promise<void> {
    if (this.isAllowedGuild(guildId)) {
      return;
    }

    // Legacy hook: never leave / never terminate â€” discovery must keep Destiled & Sojusz.
    this.deps.logger.warn('Guild event outside runtime allowlist (membership retained)', {
      guildId,
      source,
      strict: this.deps.config.DISCORD_STRICT_GUILD_ISOLATION,
    });
  }
}

/**
 * Build a deterministic transport idempotency key for a Discord â†’ Authorization event.
 *
 * The key is `dg:{type}:{...parts}` optionally suffixed with a sha256 hash of
 * the canonical JSON of `payloadForHash`. Keys never use randomUUID.
 *
 * Lifecycle occurrence identity (leave/unavailable/detach generations) is owned
 * by Authorization DB â€” not by gateway process memory. Authorization rewrites
 * terminating event keys using durable generations before writing processed_event.
 */
export function buildDiscordEventKey(
  type: string,
  parts: readonly (string | number)[],
  payloadForHash?: unknown,
): string {
  const segments = ['dg', type, ...parts.map((part) => String(part))];
  if (payloadForHash !== undefined) {
    segments.push(sha256CanonicalJson(payloadForHash));
  }
  return segments.join(':');
}

function sha256CanonicalJson(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/** Stable JSON with recursively sorted object keys for hash determinism. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(record[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * P3: allow Guilds-only (sync off) or Guilds + GuildMembers (sync on).
 * Never MessageContent / GuildPresences / other privileged extras.
 */
export function assertAllowedGatewayIntents(
  intents: readonly number[],
  authorizationSyncEnabled = false,
): void {
  const expected = authorizationSyncEnabled
    ? new Set<number>(SYNC_INTENTS)
    : new Set<number>(BASE_INTENTS);
  if (intents.length !== expected.size || intents.some((intent) => !expected.has(intent))) {
    throw new Error(
      authorizationSyncEnabled
        ? 'Only Guilds, GuildMembers, GuildMessages, GuildVoiceStates permitted when authorization sync is enabled.'
        : 'Only Guilds, GuildMessages, GuildVoiceStates permitted when authorization sync is disabled.',
    );
  }
}

/** @deprecated Prefer assertAllowedGatewayIntents(intents, syncEnabled). */
export function assertOnlyGuildsIntent(intents: readonly number[]): void {
  assertAllowedGatewayIntents(intents, false);
}
