/**
 * V2-owned identity view types. These are the stable contract shapes returned
 * across ports and HTTP; they deliberately contain no Better Auth types, no
 * session tokens, and no provider access/refresh/id tokens.
 */

/** External identity providers supported by the P2 proof slice. */
export const SUPPORTED_PROVIDERS = ['discord', 'google'] as const;

export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(value: string): value is ProviderId {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The current V2 user as exposed by `/identity/me`.
 *
 * `email` is `null` whenever the stored address is synthetic (see
 * synthetic-email); `emailSynthetic` records that fact so callers never treat a
 * synthetic address as a real contact email.
 */
export interface IdentityUserView {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly emailSynthetic: boolean;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A linked external provider account, without any raw provider tokens. */
export interface LinkedAccountView {
  readonly id: string;
  readonly provider: string;
  readonly accountId: string;
  readonly scopes: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
