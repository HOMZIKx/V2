import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

export type ResolvedRequestIds = {
  readonly correlationId: string;
  readonly requestId: string;
  readonly generated: boolean;
};

function firstHeaderValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0) {
    return value[0].trim();
  }
  return undefined;
}

export function resolveRequestIds(
  headers: Readonly<Record<string, unknown>> | undefined,
): ResolvedRequestIds {
  const correlation = firstHeaderValue(headers?.[CORRELATION_ID_HEADER]);
  const request = firstHeaderValue(headers?.[REQUEST_ID_HEADER]);
  if (correlation !== undefined && request !== undefined) {
    return { correlationId: correlation, requestId: request, generated: false };
  }
  const generatedId = randomUUID();
  return {
    correlationId: correlation ?? generatedId,
    requestId: request ?? correlation ?? generatedId,
    generated: correlation === undefined || request === undefined,
  };
}
