import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type {
  ChannelValidationResult,
  DiscordChannelValidationPort,
} from '../../application/ports/discord-channel-validation.port.js';
import type { ActivityEnv } from '../config/activity-env.js';

const VALIDATE_PATH = '/internal/activity/v1/channels/validate';
const ASSERTION_HEADER = 'discord-client-assertion';
const PROJECTION_SECRET_HEADER = 'x-activity-projection-secret';

const responseSchemaOk = (body: unknown): body is { results: ChannelValidationResult[] } => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return false;
  }
  return results.every((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const row = entry as Record<string, unknown>;
    return typeof row.channelId === 'string' && typeof row.ok === 'boolean';
  });
};

export function resolveDiscordGatewayBaseUrl(config: ActivityEnv): string | undefined {
  return config.ACTIVITY_DISCORD_GATEWAY_BASE_URL ?? config.ACTIVITY_DISCORD_PROJECTION_BASE_URL;
}

export class HttpDiscordChannelValidationClient implements DiscordChannelValidationPort {
  private fetchImpl: typeof globalThis.fetch;

  public constructor(private readonly config: ActivityEnv) {
    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  /** Test seam. */
  public setFetchImpl(fetchImpl: typeof globalThis.fetch): void {
    this.fetchImpl = fetchImpl;
  }

  public async validateChannels(
    guildId: string,
    channelIds: readonly string[],
  ): Promise<readonly ChannelValidationResult[]> {
    const baseUrl = resolveDiscordGatewayBaseUrl(this.config);
    if (baseUrl === undefined) {
      throw new Error('Discord gateway base URL is not configured');
    }

    const uniqueIds = [...new Set(channelIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.config.ACTIVITY_PROJECTION_SHARED_SECRET !== undefined) {
      headers[PROJECTION_SECRET_HEADER] = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    }
    if (this.config.ACTIVITY_ENABLED) {
      headers[ASSERTION_HEADER] = await this.signAssertion();
    }

    const url = `${baseUrl.replace(/\/$/, '')}${VALIDATE_PATH}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ guildId, channelIds: uniqueIds }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Channel validation HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const body: unknown = await response.json();
    if (!responseSchemaOk(body)) {
      throw new Error('Channel validation response shape is invalid');
    }
    return body.results;
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

export function createDiscordChannelValidationPort(
  config: ActivityEnv,
): DiscordChannelValidationPort | null {
  if (resolveDiscordGatewayBaseUrl(config) === undefined) {
    return null;
  }
  return new HttpDiscordChannelValidationClient(config);
}
