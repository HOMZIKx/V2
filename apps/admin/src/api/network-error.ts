export type NetworkFailureKind =
  'CONNECTION_REFUSED' | 'CORS' | 'WRONG_API_BASE' | 'SERVICE_NOT_RUNNING' | 'AUTH' | 'OTHER';

export class ApiNetworkError extends Error {
  public readonly kind: NetworkFailureKind;
  public readonly url: string;
  public readonly method: string;

  public constructor(input: {
    readonly kind: NetworkFailureKind;
    readonly url: string;
    readonly method: string;
    readonly cause: unknown;
  }) {
    super('Network request failed');
    this.name = 'ApiNetworkError';
    this.kind = input.kind;
    this.url = input.url;
    this.method = input.method;
    if (input.cause instanceof Error && input.cause.stack !== undefined) {
      this.cause = input.cause;
    }
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function classifyNetworkFailure(error: unknown, url: URL, method: string): ApiNetworkError {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const localTarget = isLocalHost(url.hostname);

  let kind: NetworkFailureKind = 'OTHER';
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    kind = localTarget ? 'CONNECTION_REFUSED' : 'CORS';
  } else if (message.includes('econnrefused') || message.includes('connection refused')) {
    kind = 'CONNECTION_REFUSED';
  } else if (message.includes('network request failed')) {
    kind = localTarget ? 'SERVICE_NOT_RUNNING' : 'OTHER';
  }

  if (localTarget && kind === 'CONNECTION_REFUSED') {
    kind = 'SERVICE_NOT_RUNNING';
  }

  return new ApiNetworkError({ kind, url: url.toString(), method, cause: error });
}

export function isRawFetchFailureMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === 'failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed')
  );
}
