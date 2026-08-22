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
  type MessageEditOptions,
} from 'discord.js';
import { createHash } from 'node:crypto';

import type { AuthorizationSyncPort } from '../../application/ports/authorization-sync.port.js';
import type {
  ComponentsV2MessagePayload,
  GatewayClientPort,
  GatewayHealthSnapshot,
  GatewayRestPort,
  GuildCommandDefinition,
} from '../../application/ports/gateway.ports.js';
import {
  createAuthorizationSyncClient,
  hashAuthzPayload,
} from '../authorization/authorization-sync-client.js';
import { buildSafeAllowedMentions } from '../discord/allowed-mentions.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import {
  filterBotPanelMatches,
  PANEL_MESSAGE_SCAN_DEFAULT_LIMIT,
  type ScannedChannelMessage,
} from '../discord/panel-message-scan.js';
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

const BASE_INTENTS = [GatewayIntentBits.Guilds] as const;
const SYNC_INTENTS = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] as const;

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
    this.secrets = [deps.config.DISCORD_TOKEN, deps.config.DISCORD_COMPONENT_SIGNING_SECRET].filter(
      (value) => value.length > 0,
    );
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

  public async checkChannelPermissions(guildId: string, channelId: string) {
    const detailed = await this.validateActivityPublishChannel(guildId, channelId);
    return {
      ok: detailed.ok,
      missing: detailed.missing ?? (detailed.ok ? [] : [...REQUIRED_PERMISSION_NAMES]),
    };
  }

  /**
   * Narrow channel check for Activity publish/config: guild text-based channels only.
   * Does not use activity-service; Discord SDK stays in this adapter.
   */
  public async validateActivityPublishChannel(
    guildId: string,
    channelId: string,
  ): Promise<{
    ok: boolean;
    code:
      | 'CHANNEL_MISSING'
      | 'CHANNEL_WRONG_GUILD'
      | 'CHANNEL_UNSUPPORTED'
      | 'BOT_PERMISSION_MISSING'
      | 'CHANNEL_OK';
    detail?: string;
    missing?: string[];
  }> {
    let channel;
    try {
      channel = await this.client.channels.fetch(channelId);
    } catch {
      return { ok: false, code: 'CHANNEL_MISSING', detail: 'Channel fetch failed' };
    }

    if (!channel) {
      return { ok: false, code: 'CHANNEL_MISSING', detail: 'Channel not found' };
    }

    if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) {
      return { ok: false, code: 'CHANNEL_UNSUPPORTED', detail: 'DM channels are not supported' };
    }

    const unsupportedTypes = new Set<number>([
      ChannelType.GuildForum,
      ChannelType.GuildMedia,
      ChannelType.GuildCategory,
      ChannelType.GuildDirectory,
    ]);
    if (unsupportedTypes.has(channel.type)) {
      return {
        ok: false,
        code: 'CHANNEL_UNSUPPORTED',
        detail: `Channel type ${String(channel.type)} is not supported for activity publish`,
      };
    }

    if (!('guildId' in channel) || typeof channel.guildId !== 'string') {
      return { ok: false, code: 'CHANNEL_UNSUPPORTED', detail: 'Not a guild channel' };
    }

    if (channel.guildId !== guildId) {
      return {
        ok: false,
        code: 'CHANNEL_WRONG_GUILD',
        detail: 'Channel does not belong to the requested guild',
      };
    }

    if (!channel.isTextBased() || channel.isDMBased()) {
      return {
        ok: false,
        code: 'CHANNEL_UNSUPPORTED',
        detail: 'Channel must be guild text-based',
      };
    }

    const guildChannel = channel as GuildBasedChannel;
    const me = guildChannel.guild.members.me;
    if (!me) {
      return {
        ok: false,
        code: 'BOT_PERMISSION_MISSING',
        detail: 'Bot member unavailable in guild',
        missing: [...REQUIRED_PERMISSION_NAMES],
      };
    }

    const permissions = guildChannel.permissionsFor(me);
    const missing: string[] = [];
    for (const [index, flag] of REQUIRED_CHANNEL_PERMISSIONS.entries()) {
      if (!permissions?.has(flag)) {
        missing.push(REQUIRED_PERMISSION_NAMES[index] ?? 'Unknown');
      }
    }
    if (missing.length > 0) {
      return {
        ok: false,
        code: 'BOT_PERMISSION_MISSING',
        detail: `Missing permissions: ${missing.join(', ')}`,
        missing,
      };
    }

    return { ok: true, code: 'CHANNEL_OK' };
  }

  public listGuildPresentations(): readonly { id: string; name: string }[] {
    return [...this.client.guilds.cache.values()].map((guild) => ({
      id: guild.id,
      name: guild.name,
    }));
  }

  public async getGuildPresentation(guildId: string): Promise<{ id: string; name: string } | null> {
    const cached = this.client.guilds.cache.get(guildId);
    if (cached) {
      return { id: cached.id, name: cached.name };
    }
    try {
      const guild = await this.client.guilds.fetch(guildId);
      return { id: guild.id, name: guild.name };
    } catch {
      return null;
    }
  }

  public async listGuildChannelsForAdmin(guildId: string): Promise<
    readonly {
      id: string;
      name: string;
      type: number;
      usable: boolean;
      reason?: string;
    }[]
  > {
    const guild = await this.fetchGuildOrNull(guildId);
    if (guild === null) {
      return [];
    }
    await guild.channels.fetch();
    const rows: Array<{
      id: string;
      name: string;
      type: number;
      usable: boolean;
      reason?: string;
    }> = [];
    for (const channel of guild.channels.cache.values()) {
      if (!('name' in channel) || typeof channel.name !== 'string') {
        continue;
      }
      if (channel.type === ChannelType.GuildCategory) {
        continue;
      }
      const validated = await this.validateActivityPublishChannel(guildId, channel.id);
      rows.push({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        usable: validated.ok,
        ...(validated.ok ? {} : { reason: validated.detail ?? validated.code }),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }

  public async listGuildRolesForAdmin(guildId: string): Promise<
    readonly {
      id: string;
      name: string;
      managed: boolean;
      everyone: boolean;
    }[]
  > {
    const guild = await this.fetchGuildOrNull(guildId);
    if (guild === null) {
      return [];
    }
    await guild.roles.fetch();
    return [...guild.roles.cache.values()]
      .map((role) => ({
        id: role.id,
        name: role.name,
        managed: role.managed,
        everyone: role.id === guild.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }

  public async resolveMemberDisplays(
    guildId: string,
    userIds: readonly string[],
  ): Promise<readonly { id: string; displayName: string }[]> {
    const guild = await this.fetchGuildOrNull(guildId);
    if (guild === null) {
      return [];
    }
    const unique = [...new Set(userIds.filter((id) => id.trim().length > 0))].slice(0, 50);
    const out: Array<{ id: string; displayName: string }> = [];
    for (const userId of unique) {
      try {
        const member = await guild.members.fetch(userId);
        out.push({ id: member.id, displayName: member.displayName });
      } catch {
        out.push({ id: userId, displayName: 'Organizator' });
      }
    }
    return out;
  }

  /**
   * DM-first notification delivery. Public Hub channel must never receive these.
   * DM closed/blocked → caller falls back to persistent Inbox.
   */
  public async sendDirectMessage(
    discordUserId: string,
    payload: { content: string },
  ): Promise<{
    ok: boolean;
    code?: 'DM_BLOCKED' | 'DM_CLOSED' | 'RATE_LIMITED' | 'UPSTREAM_ERROR';
    detail?: string;
    messageId?: string;
  }> {
    try {
      const user = await this.client.users.fetch(discordUserId);
      const dm = await user.createDM();
      const message = await dm.send({ content: payload.content.slice(0, 2000) });
      return { ok: true, messageId: message.id };
    } catch (error) {
      const status = readNumericProp(error, 'status');
      const code = readNumericProp(error, 'code');
      if (status === 429 || code === 429) {
        return {
          ok: false,
          code: 'RATE_LIMITED',
          detail: safeErrorMessage(error, this.secrets),
        };
      }
      // Discord: 50007 cannot send messages to this user
      if (code === 50007 || status === 403) {
        return {
          ok: false,
          code: 'DM_BLOCKED',
          detail: safeErrorMessage(error, this.secrets),
        };
      }
      return {
        ok: false,
        code: 'UPSTREAM_ERROR',
        detail: safeErrorMessage(error, this.secrets),
      };
    }
  }

  private async fetchGuildOrNull(guildId: string): Promise<Guild | null> {
    const cached = this.client.guilds.cache.get(guildId);
    if (cached) {
      return cached;
    }
    try {
      return await this.client.guilds.fetch(guildId);
    } catch {
      return null;
    }
  }

  public async publishComponentsV2Message(
    channelId: string,
    payload: ComponentsV2MessagePayload,
    options?: { nonce?: string },
  ): Promise<{ messageId: string; channelId: string }> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Channel unavailable for Components V2 publish.');
    }

    const createPayload = {
      ...payload,
      allowedMentions: buildSafeAllowedMentions(),
      ...(options?.nonce !== undefined
        ? { nonce: options.nonce, enforceNonce: true as const }
        : {}),
    } as MessageCreateOptions;

    const message = await channel.send(createPayload);
    return { messageId: message.id, channelId };
  }

  public async editComponentsV2Message(
    channelId: string,
    messageId: string,
    payload: ComponentsV2MessagePayload,
  ): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Channel unavailable for Components V2 edit.');
    }
    const editPayload = {
      ...payload,
      allowedMentions: buildSafeAllowedMentions(),
      ...(payload.files !== undefined && payload.files.length > 0 ? { attachments: [] } : {}),
    } as MessageEditOptions;
    await channel.messages.edit(messageId, editPayload);
  }

  public async fetchChannelMessage(
    channelId: string,
    messageId: string,
  ): Promise<{ id: string; channelId: string; content: string | null }> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Channel unavailable for message fetch.');
    }
    const message = await channel.messages.fetch(messageId);
    return {
      id: message.id,
      channelId,
      content: message.content.length > 0 ? message.content : null,
    };
  }

  /**
   * Scan recent channel messages for bot-authored hub panels containing opaquePanelId in custom_id.
   */
  public async findBotMessagesWithPanelOpaqueId(
    channelId: string,
    opaquePanelId: string,
    options?: { limit?: number },
  ): Promise<Array<{ messageId: string; channelId: string }>> {
    const limit = options?.limit ?? PANEL_MESSAGE_SCAN_DEFAULT_LIMIT;
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Channel unavailable for panel message scan.');
    }

    const botUserId = this.client.user?.id ?? (await this.fetchApplication()).botUserId;
    const fetched = await channel.messages.fetch({ limit });
    const scanned: ScannedChannelMessage[] = [...fetched.values()].map((message) => ({
      messageId: message.id,
      channelId,
      authorId: message.author.id,
      components: message.components,
    }));

    return filterBotPanelMatches(scanned, opaquePanelId, botUserId).map((message) => ({
      messageId: message.messageId,
      channelId: message.channelId,
    }));
  }

  public async deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error('Channel unavailable for message delete.');
    }
    await channel.messages.delete(messageId);
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

  private isAllowedGuild(guildId: string): boolean {
    return guildId === this.deps.config.DISCORD_TEST_GUILD_ID;
  }

  private async handleGuildCreate(guild: Guild): Promise<void> {
    if (!this.isAllowedGuild(guild.id)) {
      await this.handleUnauthorizedGuild(guild.id, 'guildCreate');
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
    // Transport key only — Authorization appends durable lifecycle_generation.
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

function readNumericProp(error: unknown, key: 'status' | 'code'): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if (!(key in error)) {
    return undefined;
  }
  const value: unknown = (error as Record<'status' | 'code', unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Build a deterministic transport idempotency key for a Discord → Authorization event.
 *
 * The key is `dg:{type}:{...parts}` optionally suffixed with a sha256 hash of
 * the canonical JSON of `payloadForHash`. Keys never use randomUUID.
 *
 * Lifecycle occurrence identity (leave/unavailable/detach generations) is owned
 * by Authorization DB — not by gateway process memory. Authorization rewrites
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
        ? 'Only GatewayIntentBits.Guilds and GuildMembers are permitted when authorization sync is enabled.'
        : 'Only GatewayIntentBits.Guilds is permitted when authorization sync is disabled.',
    );
  }
}

/** @deprecated Prefer assertAllowedGatewayIntents(intents, syncEnabled). */
export function assertOnlyGuildsIntent(intents: readonly number[]): void {
  assertAllowedGatewayIntents(intents, false);
}
