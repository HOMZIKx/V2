import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type ActivityVisibility = 'public' | 'private';

export function hashPrivateInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function mintPrivateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashPrivateInviteToken(token) };
}

export function privateInviteTokenMatches(token: string, expectedHash: string | null): boolean {
  if (expectedHash === null || expectedHash.length === 0) {
    return false;
  }
  const actual = Buffer.from(hashPrivateInviteToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Private visibility never grants access from obscurity alone.
 * Caller must still prove Discord membership + Authorization JOIN/READ.
 */
export function assertPrivateAccessAllowed(input: {
  readonly visibility: ActivityVisibility;
  readonly memberRoleIds: readonly string[];
  readonly allowedRoleIds: readonly string[];
  readonly inviteToken?: string;
  readonly inviteTokenHash: string | null;
}): boolean {
  if (input.visibility !== 'private') {
    return true;
  }
  const roleHit = input.allowedRoleIds.some((roleId) => input.memberRoleIds.includes(roleId));
  if (roleHit) {
    return true;
  }
  if (input.inviteToken !== undefined && input.inviteToken.length > 0) {
    return privateInviteTokenMatches(input.inviteToken, input.inviteTokenHash);
  }
  return false;
}
