/**
 * Typed failures from Activity → Discord Gateway metadata/projection HTTP.
 * Never include secrets or raw upstream bodies in messages.
 */
export type DiscordMetadataFailureKind =
  | 'not_configured'
  | 'assertion_not_configured'
  | 'unreachable'
  | 'unauthorized'
  | 'disabled'
  | 'unavailable'
  | 'malformed';

export class DiscordMetadataClientError extends Error {
  public readonly kind: DiscordMetadataFailureKind;
  public readonly httpStatus: number | undefined;

  public constructor(kind: DiscordMetadataFailureKind, message: string, httpStatus?: number) {
    super(message);
    this.name = 'DiscordMetadataClientError';
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export function isDiscordMetadataClientError(value: unknown): value is DiscordMetadataClientError {
  return value instanceof DiscordMetadataClientError;
}

export function classifyDiscordMetadataHttpStatus(status: number): DiscordMetadataFailureKind {
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }
  if (status === 404) {
    return 'unavailable';
  }
  if (status === 503 || status === 502 || status === 504) {
    return 'unavailable';
  }
  if (status >= 500) {
    return 'unavailable';
  }
  return 'malformed';
}
