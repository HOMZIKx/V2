import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type {
  DiscordChannelMetadata,
  DiscordGuildMetadataPort,
  DiscordGuildPresentation,
  DiscordMemberDisplay,
  DiscordRoleMetadata,
  HubPanelCommandResult,
} from '../../application/ports/discord-guild-metadata.port.js';
import type { ActivityEnv } from '../config/activity-env.js';
import { resolveDiscordGatewayBaseUrl } from './discord-channel-validation-client.js';

const PROJECTION_SECRET_HEADER = 'x-activity-projection-secret';
const ASSERTION_HEADER = 'discord-client-assertion';

export class HttpDiscordGuildMetadataClient implements DiscordGuildMetadataPort {
  private fetchImpl: typeof globalThis.fetch;

  public constructor(private readonly config: ActivityEnv) {
    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  public setFetchImpl(fetchImpl: typeof globalThis.fetch): void {
    this.fetchImpl = fetchImpl;
  }

  public async listGuilds(): Promise<readonly DiscordGuildPresentation[]> {
    const body = await this.requestJson('GET', '/internal/activity/v1/guilds');
    return asNamedList(body, 'guilds');
  }

  public async getGuild(guildId: string): Promise<DiscordGuildPresentation | null> {
    try {
      const body = await this.requestJson(
        'GET',
        `/internal/activity/v1/guilds/${encodeURIComponent(guildId)}`,
      );
      if (
        typeof body === 'object' &&
        body !== null &&
        typeof (body as { id?: unknown }).id === 'string' &&
        typeof (body as { name?: unknown }).name === 'string'
      ) {
        return { id: (body as { id: string }).id, name: (body as { name: string }).name };
      }
      return null;
    } catch {
      return null;
    }
  }

  public async listChannels(guildId: string): Promise<readonly DiscordChannelMetadata[]> {
    const body = await this.requestJson(
      'GET',
      `/internal/activity/v1/guilds/${encodeURIComponent(guildId)}/channels`,
    );
    return asChannelList(body);
  }

  public async listRoles(guildId: string): Promise<readonly DiscordRoleMetadata[]> {
    const body = await this.requestJson(
      'GET',
      `/internal/activity/v1/guilds/${encodeURIComponent(guildId)}/roles`,
    );
    return asRoleList(body);
  }

  public async resolveMembers(
    guildId: string,
    userIds: readonly string[],
  ): Promise<readonly DiscordMemberDisplay[]> {
    const body = await this.requestJson(
      'POST',
      `/internal/activity/v1/guilds/${encodeURIComponent(guildId)}/members/resolve`,
      { userIds },
    );
    return asMemberList(body);
  }

  public async publishHub(
    guildId: string,
    channelId: string,
    actorDiscordUserId: string,
  ): Promise<HubPanelCommandResult> {
    return this.runHub(guildId, 'publish', channelId, actorDiscordUserId);
  }

  public async reconcileHub(
    guildId: string,
    channelId: string,
    actorDiscordUserId: string,
  ): Promise<HubPanelCommandResult> {
    return this.runHub(guildId, 'reconcile', channelId, actorDiscordUserId);
  }

  private async runHub(
    guildId: string,
    action: 'publish' | 'reconcile',
    channelId: string,
    actorDiscordUserId: string,
  ): Promise<HubPanelCommandResult> {
    const body = await this.requestJson(
      'POST',
      `/internal/activity/v1/guilds/${encodeURIComponent(guildId)}/hub/${action}`,
      { channelId, actorDiscordUserId },
    );
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { mode?: unknown }).mode === 'string' &&
      typeof (body as { messageId?: unknown }).messageId === 'string'
    ) {
      return {
        mode: (body as { mode: string }).mode,
        messageId: (body as { messageId: string }).messageId,
      };
    }
    throw new Error('Hub panel command response shape is invalid');
  }

  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
  ): Promise<unknown> {
    const baseUrl = resolveDiscordGatewayBaseUrl(this.config);
    if (baseUrl === undefined) {
      throw new Error('Discord gateway base URL is not configured');
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.config.ACTIVITY_PROJECTION_SHARED_SECRET !== undefined) {
      headers[PROJECTION_SECRET_HEADER] = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    }
    if (this.config.ACTIVITY_ENABLED) {
      headers[ASSERTION_HEADER] = await this.signAssertion();
    }
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await this.fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Discord metadata HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const body: unknown = await response.json();
    return body;
  }

  private async signAssertion(): Promise<string> {
    const privateKeyPem = this.config.ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM;
    const kid = this.config.ACTIVITY_TO_DISCORD_ACTIVE_KID;
    const audience = this.config.ACTIVITY_DISCORD_ASSERTION_AUD;
    if (privateKeyPem === undefined || kid === undefined || audience === undefined) {
      throw new Error('Discord assertion signing is not configured');
    }
    const key = await importPKCS8(privateKeyPem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .setIssuer(this.config.ACTIVITY_TO_DISCORD_CLIENT_ID)
      .setSubject(this.config.ACTIVITY_TO_DISCORD_CLIENT_ID)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS)
      .sign(key);
  }
}

export function createDiscordGuildMetadataPort(
  config: ActivityEnv,
): DiscordGuildMetadataPort | null {
  if (resolveDiscordGatewayBaseUrl(config) === undefined) {
    return null;
  }
  return new HttpDiscordGuildMetadataClient(config);
}

function asNamedList(body: unknown, key: string): DiscordGuildPresentation[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const raw = (body as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { name?: unknown }).name === 'string'
    ) {
      return [{ id: (item as { id: string }).id, name: (item as { name: string }).name }];
    }
    return [];
  });
}

function asChannelList(body: unknown): DiscordChannelMetadata[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const raw = (body as { channels?: unknown }).channels;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { id?: unknown }).id !== 'string' ||
      typeof (item as { name?: unknown }).name !== 'string' ||
      typeof (item as { type?: unknown }).type !== 'number' ||
      typeof (item as { usable?: unknown }).usable !== 'boolean'
    ) {
      return [];
    }
    const row = item as {
      id: string;
      name: string;
      type: number;
      usable: boolean;
      reason?: string;
    };
    return [
      {
        id: row.id,
        name: row.name,
        type: row.type,
        usable: row.usable,
        ...(typeof row.reason === 'string' ? { reason: row.reason } : {}),
      },
    ];
  });
}

function asRoleList(body: unknown): DiscordRoleMetadata[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const raw = (body as { roles?: unknown }).roles;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { id?: unknown }).id !== 'string' ||
      typeof (item as { name?: unknown }).name !== 'string'
    ) {
      return [];
    }
    const row = item as { id: string; name: string; managed?: boolean; everyone?: boolean };
    return [
      {
        id: row.id,
        name: row.name,
        managed: row.managed === true,
        everyone: row.everyone === true,
      },
    ];
  });
}

function asMemberList(body: unknown): DiscordMemberDisplay[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const raw = (body as { members?: unknown }).members;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { id?: unknown }).id !== 'string' ||
      typeof (item as { displayName?: unknown }).displayName !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: (item as { id: string }).id,
        displayName: (item as { displayName: string }).displayName,
      },
    ];
  });
}
