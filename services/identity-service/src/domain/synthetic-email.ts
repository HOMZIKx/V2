import { createHash } from 'node:crypto';

/**
 * Reserved TLD (RFC 6761) used for every synthetic address so it can never be
 * routed or delivered to.
 */
const SYNTHETIC_LOCAL_PREFIX = 'v2';

function providerDomain(provider: string): string {
  return `${provider}.invalid`;
}

/**
 * Deterministically derive an internal, non-deliverable email for a provider
 * account that did not expose a real email (e.g. Discord with `email: null`).
 *
 * Shape: `v2+{provider}+{sha256hex16}@{provider}.invalid`.
 *
 * The address exists only to satisfy Better Auth's required `email` column. It
 * MUST NOT be used for account linking, contact, recovery, or messaging. Treat
 * it as opaque and never present it to a user as their email.
 */
export function buildSyntheticEmail(provider: string, accountId: string): string {
  const digest = createHash('sha256')
    .update(`${provider}:${accountId}`, 'utf8')
    .digest('hex')
    .slice(0, 16);

  return `${SYNTHETIC_LOCAL_PREFIX}+${provider}+${digest}@${providerDomain(provider)}`;
}

/**
 * True when the email was produced by {@link buildSyntheticEmail}. Used to hide
 * synthetic addresses from contract responses (return `email: null` instead).
 */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (email === null || email === undefined) {
    return false;
  }

  return /^v2\+[a-z0-9-]+\+[0-9a-f]{16}@[a-z0-9-]+\.invalid$/i.test(email);
}
