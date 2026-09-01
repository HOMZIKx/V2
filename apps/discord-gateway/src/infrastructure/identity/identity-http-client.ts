import { randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';

import { isPartyRoleKey, type PartyRoleKey } from '@v2/hub-core';

export type IdentityClientMode = 'headers' | 'assertion';

export type IdentityHttpClientConfig = {
  readonly baseUrl: string;
  readonly mode: IdentityClientMode;
  readonly clientId?: string;
  readonly privateKeyPem?: string;
  readonly activeKid?: string;
  readonly audience?: string;
  readonly ttlSeconds?: number;
};

export type IdentityActorContext = {
  readonly discordUserId: string;
  readonly v2UserId?: string;
};

export class IdentityHttpError extends Error {
  public constructor(
    message: string,
    public readonly code: 'NETWORK' | 'HTTP' | 'VALIDATION' | 'RATE_LIMITED' | 'UNAVAILABLE',
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'IdentityHttpError';
  }
}

const characterSchema = z
  .object({
    id: z.string().min(1),
    nickname: z.string(),
    classSpecKey: z.string(),
    classSpecLabel: z.string().optional(),
    level: z.number().nullable().optional(),
    isDefault: z.boolean().optional(),
    partyRoles: z.array(z.enum(['TANK', 'BUFF', 'DPS', 'FLEX'])),
  })
  .passthrough();

const profileSchema = z
  .object({
    profile: z
      .object({
        userId: z.string(),
        displayName: z.string().nullable().optional(),
        activeCharacterId: z.string().nullable().optional(),
        characters: z.array(characterSchema).default([]),
        interestKeys: z.array(z.string()).default([]),
      })
      .passthrough(),
  })
  .passthrough();

export type IdentityProfileCharacter = z.infer<typeof characterSchema>;
export type IdentityProfile = z.infer<typeof profileSchema>['profile'];

const ASSERTION_HEADER = 'Identity-Client-Assertion';

export type IdentityHttpClientDeps = {
  readonly config: IdentityHttpClientConfig;
  readonly fetchImpl?: typeof fetch;
};

export class IdentityHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  public constructor(private readonly deps: IdentityHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.baseUrl = deps.config.baseUrl.replace(/\/$/, '');
  }

  public async getProfile(actor: IdentityActorContext): Promise<IdentityProfile> {
    const path =
      this.deps.config.mode === 'assertion'
        ? '/identity/v1/internal/profile'
        : '/identity/v1/profile';
    const parsed = await this.request('GET', path, profileSchema, { actor });
    return parsed.profile;
  }

  public async createCharacter(
    body: {
      nickname: string;
      classSpecKey: string;
      partyRoles: readonly PartyRoleKey[];
      isDefault?: boolean;
      level?: number | null;
    },
    actor: IdentityActorContext,
  ): Promise<{ characterId: string; profile: IdentityProfile }> {
    for (const role of body.partyRoles) {
      if (!isPartyRoleKey(role)) {
        throw new IdentityHttpError('Invalid party role in payload', 'VALIDATION');
      }
    }
    const path =
      this.deps.config.mode === 'assertion'
        ? '/identity/v1/internal/profile/characters'
        : '/identity/v1/profile/characters';
    const parsed = await this.request(
      'POST',
      path,
      z
        .object({
          characterId: z.string().min(1),
          profile: profileSchema.shape.profile,
        })
        .passthrough(),
      { body, actor },
    );
    return { characterId: parsed.characterId, profile: parsed.profile };
  }

  public async updateCharacter(
    characterId: string,
    body: {
      nickname: string;
      classSpecKey: string;
      partyRoles: readonly PartyRoleKey[];
      isDefault?: boolean;
      level?: number | null;
    },
    actor: IdentityActorContext,
  ): Promise<{ characterId: string; profile: IdentityProfile }> {
    for (const role of body.partyRoles) {
      if (!isPartyRoleKey(role)) {
        throw new IdentityHttpError('Invalid party role in payload', 'VALIDATION');
      }
    }
    const path =
      this.deps.config.mode === 'assertion'
        ? `/identity/v1/internal/profile/characters/${encodeURIComponent(characterId)}`
        : `/identity/v1/profile/characters/${encodeURIComponent(characterId)}`;
    const parsed = await this.request(
      'PUT',
      path,
      z
        .object({
          characterId: z.string().min(1),
          profile: profileSchema.shape.profile,
        })
        .passthrough(),
      { body, actor },
    );
    return { characterId: parsed.characterId, profile: parsed.profile };
  }

  public async setInterests(
    interestKeys: readonly string[],
    actor: IdentityActorContext,
  ): Promise<IdentityProfile> {
    const parsed = await this.request('PUT', '/identity/v1/profile/interests', profileSchema, {
      body: { interestKeys },
      actor,
    });
    return parsed.profile;
  }

  private async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    options: {
      body?: unknown;
      actor: IdentityActorContext;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': randomUUID(),
    };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    if (this.deps.config.mode === 'headers') {
      headers['X-Actor-Discord-User-Id'] = options.actor.discordUserId;
      if (options.actor.v2UserId !== undefined) {
        headers['X-Actor-V2-User-Id'] = options.actor.v2UserId;
      }
    } else {
      const audience = this.deps.config.audience;
      headers[ASSERTION_HEADER] = await this.buildAssertion(options.actor, audience ?? `${this.baseUrl}${path}`);
    }

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(10_000),
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new IdentityHttpError(
        error instanceof Error ? error.message : 'Identity service network failure',
        'NETWORK',
      );
    }

    const text = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new IdentityHttpError('Identity service rate limited', 'RATE_LIMITED', 429, text);
    }
    if (response.status >= 500) {
      throw new IdentityHttpError(
        'Identity service unavailable',
        'UNAVAILABLE',
        response.status,
        text,
      );
    }
    if (!response.ok) {
      throw new IdentityHttpError(
        `Identity service rejected request (${String(response.status)})`,
        'HTTP',
        response.status,
        text,
      );
    }

    let json: unknown = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        throw new IdentityHttpError(
          'Identity service returned non-JSON',
          'VALIDATION',
          response.status,
          text,
        );
      }
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new IdentityHttpError(
        'Identity response validation failed',
        'VALIDATION',
        response.status,
        text,
      );
    }
    return parsed.data;
  }

  private async buildAssertion(actor: IdentityActorContext, audience: string): Promise<string> {
    const { clientId, privateKeyPem, activeKid, ttlSeconds = 60 } = this.deps.config;
    if (
      clientId === undefined ||
      privateKeyPem === undefined ||
      activeKid === undefined ||
      audience.trim().length === 0
    ) {
      throw new IdentityHttpError(
        'Identity assertion mode is incompletely configured',
        'VALIDATION',
      );
    }
    const ttl = Math.min(Math.max(1, ttlSeconds), 60);
    const key = await importPKCS8(privateKeyPem, 'EdDSA');
    return new SignJWT({
      jti: randomUUID(),
      actor_discord_user_id: actor.discordUserId,
      ...(actor.v2UserId !== undefined ? { actor_v2_user_id: actor.v2UserId } : {}),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: activeKid })
      .setIssuer(clientId)
      .setSubject(clientId)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key);
  }
}

export function createIdentityHttpClientOrNull(
  config: {
    DISCORD_ACTIVITY_ENABLED: boolean;
    IDENTITY_SERVICE_BASE_URL?: string | undefined;
    ACTIVITY_CLIENT_MODE: IdentityClientMode;
    DISCORD_TO_IDENTITY_CLIENT_ID?: string | undefined;
    DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM?: string | undefined;
    DISCORD_TO_IDENTITY_ACTIVE_KID?: string | undefined;
    IDENTITY_ASSERTION_AUD?: string | undefined;
    DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS?: number | undefined;
  },
  fetchImpl?: typeof fetch,
): IdentityHttpClient | null {
  if (!config.DISCORD_ACTIVITY_ENABLED) {
    return null;
  }
  const baseUrl = config.IDENTITY_SERVICE_BASE_URL?.trim();
  if (baseUrl === undefined || baseUrl.length === 0) {
    return null;
  }
  const clientConfig: IdentityHttpClientConfig = {
    baseUrl,
    mode: config.ACTIVITY_CLIENT_MODE,
  };
  if (config.DISCORD_TO_IDENTITY_CLIENT_ID !== undefined) {
    (clientConfig as { clientId?: string }).clientId = config.DISCORD_TO_IDENTITY_CLIENT_ID;
  }
  if (config.DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM !== undefined) {
    (clientConfig as { privateKeyPem?: string }).privateKeyPem =
      config.DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM;
  }
  if (config.DISCORD_TO_IDENTITY_ACTIVE_KID !== undefined) {
    (clientConfig as { activeKid?: string }).activeKid = config.DISCORD_TO_IDENTITY_ACTIVE_KID;
  }
  if (config.IDENTITY_ASSERTION_AUD !== undefined) {
    (clientConfig as { audience?: string }).audience = config.IDENTITY_ASSERTION_AUD;
  }
  if (config.DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS !== undefined) {
    (clientConfig as { ttlSeconds?: number }).ttlSeconds =
      config.DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS;
  }

  return new IdentityHttpClient({
    config: clientConfig,
    ...(fetchImpl !== undefined ? { fetchImpl } : {}),
  });
}
