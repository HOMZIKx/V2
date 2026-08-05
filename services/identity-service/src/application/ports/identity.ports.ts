import type { IdentityUserView, LinkedAccountView, ProviderId } from '../../domain/identity-models.js';

/**
 * Application-facing port for identity/session operations. The infrastructure
 * adapter (Better Auth) implements this; domain and application never import
 * the auth engine directly.
 *
 * `headers` is the standard web {@link Headers} carrying the request cookies so
 * the adapter can resolve the caller's session. No raw session token or cookie
 * value is ever returned across this boundary.
 */
export interface IdentitySessionPort {
  getMe(headers: Headers): Promise<IdentityUserView | null>;
  listAccounts(headers: Headers): Promise<LinkedAccountView[]>;
  startLink(provider: ProviderId, headers: Headers, callbackURL: string): Promise<{ url: string }>;
  unlinkAccount(accountId: string, headers: Headers): Promise<void>;
  logoutCurrent(headers: Headers): Promise<void>;
  logoutAll(headers: Headers): Promise<void>;
  /** System revoke — deletes every session for a user. No public admin endpoint. */
  revokeAllSessionsForUser(userId: string): Promise<void>;
}
