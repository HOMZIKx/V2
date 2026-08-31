import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import { isPartyRoleKey } from '@v2/hub-core';

import type {
  LfgCharacterVerifyPort,
  VerifiedLfgCharacter,
} from '../../application/ports/activity.ports.js';
import { ActivityError } from '../../domain/errors.js';
import type { ActivityEnv } from '../config/activity-env.js';

export interface HttpIdentityCharacterClientOptions {
  readonly baseUrl: string;
  readonly assertionAud: string;
  readonly clientId: string;
  readonly kid: string;
  readonly privateKeyPem: string;
  readonly maxTtlSeconds: number;
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * S2S Identity character resolve client. Signs EdDSA client assertions and POSTs
 * `/identity/v1/internal/character/resolve`.
 */
export class HttpIdentityCharacterClient implements LfgCharacterVerifyPort {
  private readonly fetchImpl: typeof globalThis.fetch;

  public constructor(private readonly options: HttpIdentityCharacterClientOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public static fromEnv(
    config: ActivityEnv,
    fetchImpl?: typeof globalThis.fetch,
  ): HttpIdentityCharacterClient | null {
    if (
      config.ACTIVITY_IDENTITY_BASE_URL === undefined ||
      config.ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD === undefined ||
      config.ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM === undefined ||
      config.ACTIVITY_TO_IDENTITY_ACTIVE_KID === undefined
    ) {
      return null;
    }

    return new HttpIdentityCharacterClient({
      baseUrl: config.ACTIVITY_IDENTITY_BASE_URL.replace(/\/$/, ''),
      assertionAud: config.ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD,
      clientId: config.ACTIVITY_TO_IDENTITY_CLIENT_ID,
      kid: config.ACTIVITY_TO_IDENTITY_ACTIVE_KID,
      privateKeyPem: config.ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM,
      maxTtlSeconds: config.ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    });
  }

  public async resolveCharacter(input: {
    readonly discordUserId: string;
    readonly characterId: string;
    readonly sessionRoles: readonly string[];
  }): Promise<VerifiedLfgCharacter> {
    const assertion = await this.signAssertion();
    const url = `${this.options.baseUrl}/identity/v1/internal/character/resolve`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'identity-client-assertion': assertion,
        },
        body: JSON.stringify({
          discordUserId: input.discordUserId,
          characterId: input.characterId,
          sessionRoles: input.sessionRoles,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ActivityError(
        'DEPENDENCY_UNAVAILABLE',
        'Failed to reach Identity character resolve endpoint',
      );
    }

    if (response.status === 404) {
      throw new ActivityError('NOT_FOUND', 'Character not found for user');
    }
    if (!response.ok) {
      throw new ActivityError(
        'DEPENDENCY_UNAVAILABLE',
        `Identity character resolve failed with status ${response.status}`,
      );
    }

    let body: {
      characterId?: unknown;
      classSpecKey?: unknown;
      classSpecLabel?: unknown;
      supportedPartyRoles?: unknown;
      sessionRoles?: unknown;
    };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new ActivityError('DEPENDENCY_UNAVAILABLE', 'Identity returned invalid JSON');
    }

    const supported = Array.isArray(body.supportedPartyRoles)
      ? body.supportedPartyRoles.filter(isPartyRoleKey)
      : [];
    const session = Array.isArray(body.sessionRoles)
      ? body.sessionRoles.filter(isPartyRoleKey)
      : [];
    if (
      typeof body.characterId !== 'string' ||
      typeof body.classSpecKey !== 'string' ||
      typeof body.classSpecLabel !== 'string' ||
      supported.length === 0 ||
      session.length === 0
    ) {
      throw new ActivityError('VALIDATION_FAILED', 'Identity returned invalid character payload');
    }

    return {
      characterId: body.characterId,
      classSpecKey: body.classSpecKey,
      classSpecLabel: body.classSpecLabel,
      supportedPartyRoles: supported,
      sessionRoles: session,
    };
  }

  private async signAssertion(): Promise<string> {
    const key = await importPKCS8(this.options.privateKeyPem, 'EdDSA');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.options.kid })
      .setIssuer(this.options.clientId)
      .setSubject(this.options.clientId)
      .setAudience(this.options.assertionAud)
      .setIssuedAt(now)
      .setExpirationTime(now + this.options.maxTtlSeconds)
      .sign(key);
  }
}

/** Dev/test stub when ACTIVITY_ENABLED=false — trusts session roles after UUID validation. */
export class PassThroughCharacterVerifyClient implements LfgCharacterVerifyPort {
  public resolveCharacter(input: {
    readonly discordUserId: string;
    readonly characterId: string;
    readonly sessionRoles: readonly string[];
  }): Promise<VerifiedLfgCharacter> {
    const session = input.sessionRoles.filter(isPartyRoleKey);
    if (session.length === 0) {
      throw new ActivityError('VALIDATION_FAILED', 'At least one valid party role is required');
    }
    return Promise.resolve({
      characterId: input.characterId,
      classSpecKey: 'unknown',
      classSpecLabel: 'Unknown',
      supportedPartyRoles: session,
      sessionRoles: session,
    });
  }
}

/** Production fail-closed stub when ACTIVITY_ENABLED=false. */
export class DenyAllCharacterVerifyClient implements LfgCharacterVerifyPort {
  public resolveCharacter(): Promise<VerifiedLfgCharacter> {
    return Promise.reject(
      new ActivityError('DEPENDENCY_UNAVAILABLE', 'Character verification is disabled'),
    );
  }
}

export function createIdentityCharacterClient(
  config: ActivityEnv,
  fetchImpl?: typeof globalThis.fetch,
): LfgCharacterVerifyPort {
  if (!config.ACTIVITY_ENABLED) {
    // Production never trusts client-supplied sessionRoles as capability state.
    if (config.NODE_ENV === 'production') {
      const client = HttpIdentityCharacterClient.fromEnv(config, fetchImpl);
      if (client !== null) {
        return client;
      }
      return new DenyAllCharacterVerifyClient();
    }
    return new PassThroughCharacterVerifyClient();
  }
  const client = HttpIdentityCharacterClient.fromEnv(config, fetchImpl);
  if (client === null) {
    throw new Error(
      'Identity character client could not be constructed while ACTIVITY_ENABLED=true',
    );
  }
  return client;
}
