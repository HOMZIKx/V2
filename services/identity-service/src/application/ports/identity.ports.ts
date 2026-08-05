import type {
  IdentityUserView,
  LinkedAccountView,
  ProviderId,
} from '../../domain/identity-models.js';

/**
 * Cookie-clearing headers produced by logout. Controllers forward these as
 * distinct `Set-Cookie` response headers so the browser drops the session.
 */
export interface LogoutResult {
  readonly setCookieHeaders: readonly string[];
}

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
  logoutCurrent(headers: Headers): Promise<LogoutResult>;
  logoutAll(headers: Headers): Promise<LogoutResult>;
  /** System revoke — deletes every session for a user. No public admin endpoint. */
  revokeAllSessionsForUser(userId: string): Promise<void>;
}
