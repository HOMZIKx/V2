export type GatewayConnectionState =
  'disabled' | 'connecting' | 'ready' | 'degraded' | 'stopping' | 'failed';

export type GatewayHealthSnapshot = {
  state: GatewayConnectionState;
  enabled: boolean;
  guildId: string;
  pingMs: number | null;
  uptimeSeconds: number;
  commandsRegistered: boolean;
  isolationOk: boolean;
  lastError: string | null;
};

export type GatewayClientPort = {
  getState(): GatewayConnectionState;
  getSnapshot(): GatewayHealthSnapshot;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type GuildCommandDefinition = {
  name: string;
  description: string;
  version: string;
};

export type GatewayRestPort = {
  fetchApplication(): Promise<{ id: string; name: string; botUserId: string }>;
  fetchGuild(guildId: string): Promise<{ id: string; name: string; botIsMember: boolean }>;
  listGuildCommands(guildId: string): Promise<Array<{ name: string; id: string }>>;
  listGlobalCommands(): Promise<Array<{ name: string; id: string }>>;
  putGuildCommands(
    guildId: string,
    commands: GuildCommandDefinition[],
  ): Promise<Array<{ name: string; id: string }>>;
  checkChannelPermissions?(
    guildId: string,
    channelId: string,
  ): Promise<{ missing: string[]; ok: boolean }>;
};
