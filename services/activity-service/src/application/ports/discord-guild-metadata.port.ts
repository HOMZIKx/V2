export interface DiscordGuildPresentation {
  readonly id: string;
  readonly name: string;
}

export interface DiscordChannelMetadata {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly usable: boolean;
  readonly reason?: string;
}

export interface DiscordRoleMetadata {
  readonly id: string;
  readonly name: string;
  readonly managed: boolean;
  readonly everyone: boolean;
}

export interface DiscordMemberDisplay {
  readonly id: string;
  readonly displayName: string;
}

export interface HubPanelCommandResult {
  readonly mode: string;
  readonly messageId: string;
}

/**
 * Read-only Discord metadata + hub execute. Discord SDK stays in discord-gateway.
 */
export type DiscordGatewayRuntimeProbe = {
  readonly processOk: boolean;
  readonly botState: 'ready' | 'disconnected' | 'disabled' | 'unknown';
};

export interface DiscordGuildMetadataPort {
  listGuilds(): Promise<readonly DiscordGuildPresentation[]>;
  getGuild(guildId: string): Promise<DiscordGuildPresentation | null>;
  listChannels(guildId: string): Promise<readonly DiscordChannelMetadata[]>;
  listRoles(guildId: string): Promise<readonly DiscordRoleMetadata[]>;
  resolveMembers(
    guildId: string,
    userIds: readonly string[],
  ): Promise<readonly DiscordMemberDisplay[]>;
  publishHub(
    guildId: string,
    channelId: string,
    actorDiscordUserId: string,
  ): Promise<HubPanelCommandResult>;
  reconcileHub(
    guildId: string,
    channelId: string,
    actorDiscordUserId: string,
  ): Promise<HubPanelCommandResult>;
  /** Optional process/bot probe — separate from metadata contract success. */
  probeGatewayRuntime?(): Promise<DiscordGatewayRuntimeProbe>;
}
