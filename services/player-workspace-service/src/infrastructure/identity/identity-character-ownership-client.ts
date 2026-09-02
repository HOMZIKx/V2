import { randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';

import type { CharacterOwnershipPort } from '../../application/ports/player-workspace.ports.js';
import { PlayerWorkspaceError } from '../../domain/errors.js';
import type { PlayerWorkspaceEnv } from '../config/player-workspace-env.js';

export class HttpIdentityCharacterOwnershipClient implements CharacterOwnershipPort {
  public constructor(
    private readonly options: {
      readonly baseUrl: string;
      readonly assertionAud: string;
      readonly clientId: string;
      readonly kid: string;
      readonly privateKeyPem: string;
      readonly maxTtlSeconds: number;
      readonly fetchImpl?: typeof globalThis.fetch;
    },
  ) {}

  public static fromEnv(
    config: PlayerWorkspaceEnv,
    fetchImpl?: typeof globalThis.fetch,
  ): HttpIdentityCharacterOwnershipClient | null {
    if (
      config.PLAYER_WORKSPACE_IDENTITY_BASE_URL === undefined ||
      config.PLAYER_WORKSPACE_IDENTITY_OWNERSHIP_ASSERTION_AUD === undefined ||
      config.PLAYER_WORKSPACE_TO_IDENTITY_PRIVATE_KEY_PEM === undefined ||
      config.PLAYER_WORKSPACE_TO_IDENTITY_ACTIVE_KID === undefined
    ) {
      return null;
    }
    return new HttpIdentityCharacterOwnershipClient({
      baseUrl: config.PLAYER_WORKSPACE_IDENTITY_BASE_URL.replace(/\/$/, ''),
      assertionAud: config.PLAYER_WORKSPACE_IDENTITY_OWNERSHIP_ASSERTION_AUD,
      clientId: config.PLAYER_WORKSPACE_TO_IDENTITY_CLIENT_ID,
      kid: config.PLAYER_WORKSPACE_TO_IDENTITY_ACTIVE_KID,
      privateKeyPem: config.PLAYER_WORKSPACE_TO_IDENTITY_PRIVATE_KEY_PEM,
      maxTtlSeconds: config.PLAYER_WORKSPACE_CLIENT_ASSERTION_MAX_TTL_SECONDS,
      ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    });
  }

  public async assertOwnedByActor(input: {
    readonly characterId: string;
    readonly v2UserId: string;
  }): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const assertion = await this.signAssertion();
    const url = `${this.options.baseUrl}/identity/v1/internal/character/ownership`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'identity-client-assertion': assertion,
        },
        body: JSON.stringify({
          v2UserId: input.v2UserId,
          characterId: input.characterId,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new PlayerWorkspaceError(
        'DEPENDENCY_UNAVAILABLE',
        'Failed to reach Identity character ownership endpoint',
      );
    }

    if (response.status === 404) {
      throw new PlayerWorkspaceError(
        'FORBIDDEN',
        'Canonical character not found for actor or does not exist',
      );
    }
    if (!response.ok) {
      throw new PlayerWorkspaceError(
        'DEPENDENCY_UNAVAILABLE',
        `Identity character ownership failed with status ${response.status}`,
      );
    }

    const body = (await response.json()) as { owned?: unknown };
    if (body.owned !== true) {
      throw new PlayerWorkspaceError(
        'FORBIDDEN',
        'Cannot link a canonical character that is not owned by the actor',
      );
    }
  }

  private async signAssertion(): Promise<string> {
    const key = await importPKCS8(this.options.privateKeyPem.replace(/\\n/g, '\n'), 'EdDSA');
    return new SignJWT({ jti: randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.options.kid })
      .setIssuer(this.options.clientId)
      .setSubject(this.options.clientId)
      .setAudience(this.options.assertionAud)
      .setIssuedAt()
      .setExpirationTime(`${this.options.maxTtlSeconds}s`)
      .sign(key);
  }
}
