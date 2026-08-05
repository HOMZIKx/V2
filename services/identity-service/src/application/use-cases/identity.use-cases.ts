import type { IdentityUserView, LinkedAccountView, ProviderId } from '../../domain/identity-models.js';
import type { IdentitySessionPort } from '../ports/identity.ports.js';

/**
 * Thin, framework-free use-cases over {@link IdentitySessionPort}. Controllers
 * depend on these rather than on the adapter directly, keeping the auth engine
 * out of the interface layer's type surface.
 */

export function getMe(port: IdentitySessionPort, headers: Headers): Promise<IdentityUserView | null> {
  return port.getMe(headers);
}

export function listAccounts(
  port: IdentitySessionPort,
  headers: Headers,
): Promise<LinkedAccountView[]> {
  return port.listAccounts(headers);
}

export function startLink(
  port: IdentitySessionPort,
  provider: ProviderId,
  headers: Headers,
  callbackURL: string,
): Promise<{ url: string }> {
  return port.startLink(provider, headers, callbackURL);
}

export function unlinkAccount(
  port: IdentitySessionPort,
  accountId: string,
  headers: Headers,
): Promise<void> {
  return port.unlinkAccount(accountId, headers);
}

export function logoutCurrent(port: IdentitySessionPort, headers: Headers): Promise<void> {
  return port.logoutCurrent(headers);
}

export function logoutAll(port: IdentitySessionPort, headers: Headers): Promise<void> {
  return port.logoutAll(headers);
}

export function revokeAllSessionsForUser(
  port: IdentitySessionPort,
  userId: string,
): Promise<void> {
  return port.revokeAllSessionsForUser(userId);
}
