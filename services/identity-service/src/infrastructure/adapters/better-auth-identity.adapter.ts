import { APIError } from 'better-auth';

import type { IdentitySessionPort } from '../../application/ports/identity.ports.js';
import { IdentityError } from '../../domain/errors.js';
import type {
  IdentityUserView,
  LinkedAccountView,
  ProviderId,
} from '../../domain/identity-models.js';
import { isSyntheticEmail } from '../../domain/synthetic-email.js';
import type { BetterAuthInstance } from '../auth/create-better-auth.js';

function toIso(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return new Date(0).toISOString();
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Translate a Better Auth / better-call error into a stable V2 IdentityError.
 * Raw library messages never leak past this function.
 */
function mapError(error: unknown): IdentityError {
  if (error instanceof IdentityError) {
    return error;
  }

  if (error instanceof APIError) {
    const code = typeof error.body?.code === 'string' ? error.body.code : undefined;
    const status = error.statusCode;

    switch (code) {
      case 'FAILED_TO_UNLINK_LAST_ACCOUNT':
        return new IdentityError('CANNOT_UNLINK_LAST');
      case 'SOCIAL_ACCOUNT_ALREADY_LINKED':
        return new IdentityError('ACCOUNT_ALREADY_LINKED');
      case 'ACCOUNT_NOT_FOUND':
      case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
        return new IdentityError('NOT_FOUND');
      case 'SESSION_EXPIRED':
      case 'FAILED_TO_GET_SESSION':
        return new IdentityError('UNAUTHENTICATED');
      default:
        break;
    }

    if (status === 401) {
      return new IdentityError('UNAUTHENTICATED');
    }
    if (status === 404) {
      return new IdentityError('NOT_FOUND');
    }
    return new IdentityError('VALIDATION_FAILED');
  }

  return new IdentityError('VALIDATION_FAILED', 'Unexpected identity error');
}

/**
 * Adapter binding the V2 {@link IdentitySessionPort} to the Better Auth engine.
 * This is the only place that speaks Better Auth's `auth.api` surface; it maps
 * results into V2 view types and errors into stable V2 codes.
 */
export class BetterAuthIdentityAdapter implements IdentitySessionPort {
  public constructor(private readonly auth: BetterAuthInstance) {}

  public async getMe(headers: Headers): Promise<IdentityUserView | null> {
    let session: Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>;
    try {
      session = await this.auth.api.getSession({ headers });
    } catch (error) {
      throw mapError(error);
    }

    if (session === null) {
      return null;
    }

    const user = session.user;
    const synthetic = isSyntheticEmail(user.email);

    return {
      id: user.id,
      name: user.name,
      email: synthetic ? null : (user.email ?? null),
      emailSynthetic: synthetic,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
      createdAt: toIso(user.createdAt),
      updatedAt: toIso(user.updatedAt),
    };
  }

  public async listAccounts(headers: Headers): Promise<LinkedAccountView[]> {
    try {
      const accounts = await this.auth.api.listUserAccounts({ headers });
      return accounts.map((account) => ({
        id: account.id,
        provider: account.providerId,
        accountId: account.accountId,
        scopes: account.scopes ?? [],
        createdAt: toIso(account.createdAt),
        updatedAt: toIso(account.updatedAt),
      }));
    } catch (error) {
      throw mapError(error);
    }
  }

  public async startLink(
    provider: ProviderId,
    headers: Headers,
    callbackURL: string,
  ): Promise<{ url: string }> {
    try {
      const result = await this.auth.api.linkSocialAccount({
        body: { provider, callbackURL },
        headers,
      });
      return { url: result.url };
    } catch (error) {
      throw mapError(error);
    }
  }

  public async unlinkAccount(accountId: string, headers: Headers): Promise<void> {
    try {
      const accounts = await this.auth.api.listUserAccounts({ headers });
      const target = accounts.find((account) => account.id === accountId);
      if (target === undefined) {
        throw new IdentityError('NOT_FOUND');
      }

      await this.auth.api.unlinkAccount({
        body: { providerId: target.providerId, accountId: target.accountId },
        headers,
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  public async logoutCurrent(headers: Headers): Promise<void> {
    try {
      await this.auth.api.signOut({ headers });
    } catch (error) {
      throw mapError(error);
    }
  }

  public async logoutAll(headers: Headers): Promise<void> {
    try {
      await this.auth.api.revokeSessions({ headers });
    } catch (error) {
      throw mapError(error);
    }
  }

  public async revokeAllSessionsForUser(userId: string): Promise<void> {
    try {
      const context = await this.auth.$context;
      await context.internalAdapter.deleteUserSessions(userId);
    } catch (error) {
      throw mapError(error);
    }
  }
}
