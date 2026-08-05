export interface InternalTokenView {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresInSeconds: number;
}

export interface ClientAssertionPort {
  verify(assertion: string): Promise<{ clientId: string; kid: string; jti: string }>;
  assertJtiOnce(jti: string, ttlSeconds: number): Promise<void>;
  assertAudienceAllowed(clientId: string, audience: string): void;
}

export interface InternalJwtIssuePort {
  issue(userId: string, audience: string): Promise<InternalTokenView>;
  getJwks(): { readonly keys: readonly Record<string, unknown>[] };
}
