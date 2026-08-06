import { createHash } from 'node:crypto';

import type {
  AuthorizationSyncPort,
  AuthzDiscordEventInput,
  AuthzReconcileSnapshot,
} from '../../application/ports/authorization-sync.port.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import { buildDiscordToAuthzAssertion } from './build-client-assertion.js';

export type AuthorizationSyncLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

const ASSERTION_HEADER = 'Authorization-Client-Assertion';

export type AuthorizationSyncClientDeps = {
  readonly config: DiscordGatewayConfig;
  readonly logger: AuthorizationSyncLogger;
  readonly fetchImpl?: typeof fetch;
};

/**
 * HTTP client for Discord Gateway -> Authorization membership sync.
 * Inactive when DISCORD_AUTHORIZATION_SYNC_ENABLED is false.
 */
export class HttpAuthorizationSyncClient implements AuthorizationSyncPort {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly deps: AuthorizationSyncClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  private requireSyncConfig(): {
    baseUrl: string;
    audience: string | undefined;
    clientId: string;
    privatePem: string;
    kid: string;
    ttlSeconds: number;
  } {
    const {
      AUTHORIZATION_BASE_URL: baseUrl,
      AUTHORIZATION_ASSERTION_AUD: audience,
      DISCORD_TO_AUTHZ_CLIENT_ID: clientId,
      DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM: privatePem,
      DISCORD_TO_AUTHZ_ACTIVE_KID: kid,
      DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS: ttlSeconds,
    } = this.deps.config;

    if (baseUrl === undefined || privatePem === undefined || kid === undefined) {
      throw new Error('Discord Authorization sync is enabled but incompletely configured');
    }

    return {
      baseUrl: baseUrl.replace(/\/$/, ''),
      audience,
      clientId,
      privatePem,
      kid,
      ttlSeconds,
    };
  }

  private async signAssertion(audience: string): Promise<string> {
    const cfg = this.requireSyncConfig();
    return buildDiscordToAuthzAssertion({
      clientId: cfg.clientId,
      privateKeyPem: cfg.privatePem,
      activeKid: cfg.kid,
      audience,
      ttlSeconds: cfg.ttlSeconds,
    });
  }

  private resolveAudience(path: string): string {
    const cfg = this.requireSyncConfig();
    if (cfg.audience !== undefined && cfg.audience.length > 0) {
      return cfg.audience;
    }
    return `${cfg.baseUrl}${path}`;
  }

  private async postJson(path: string, body: unknown): Promise<void> {
    const cfg = this.requireSyncConfig();
    const audience = this.resolveAudience(path);
    const assertion = await this.signAssertion(audience);
    let response: Response;
    try {
      response = await this.fetchImpl(`${cfg.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [ASSERTION_HEADER]: assertion,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.deps.logger.error('Authorization sync request failed (network)', {
        path,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.deps.logger.error('Authorization sync request rejected', {
        path,
        status: response.status,
        body: text.slice(0, 200),
      });
      throw new Error(`Authorization sync failed (${String(response.status)}) for ${path}`);
    }
  }

  public async registerGuild(discordGuildId: string): Promise<void> {
    await this.postJson('/authorization/v1/discord/guilds/register', { discordGuildId });
  }

  public async applyDiscordEvent(input: AuthzDiscordEventInput): Promise<void> {
    const body: Record<string, unknown> = {
      eventKey: input.eventKey,
      eventType: input.eventType,
      discordGuildId: input.discordGuildId,
      payload: input.payload,
    };
    if (input.payloadHash !== undefined) {
      body.payloadHash = input.payloadHash;
    }
    await this.postJson('/authorization/v1/discord/events', body);
  }

  public async reconcileGuild(
    discordGuildId: string,
    snapshot: AuthzReconcileSnapshot,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      members: snapshot.members,
      roles: snapshot.roles,
    };
    if (snapshot.eventKey !== undefined) {
      body.eventKey = snapshot.eventKey;
    }
    await this.postJson(
      `/authorization/v1/discord/guilds/${encodeURIComponent(discordGuildId)}/reconcile`,
      body,
    );
  }
}

export function hashAuthzPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function createAuthorizationSyncClient(
  config: DiscordGatewayConfig,
  logger: AuthorizationSyncLogger,
  fetchImpl?: typeof fetch,
): AuthorizationSyncPort | null {
  if (!config.DISCORD_AUTHORIZATION_SYNC_ENABLED) {
    return null;
  }
  return new HttpAuthorizationSyncClient({
    config,
    logger,
    ...(fetchImpl !== undefined ? { fetchImpl } : {}),
  });
}
