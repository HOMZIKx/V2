import { ApiClientError } from '../lib/api';

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }
  | { kind: 'forbidden' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'unauthorized' };

export function mapApiError(err: unknown): LoadState {
  if (err instanceof ApiClientError) {
    if (err.isUnauthorized) {
      return { kind: 'unauthorized' };
    }
    if (err.isForbidden) {
      return { kind: 'forbidden' };
    }
    if (err.isUnavailable || err.status >= 500) {
      return { kind: 'unavailable', message: err.message };
    }
    return { kind: 'error', message: err.message };
  }
  return {
    kind: 'error',
    message: err instanceof Error ? err.message : 'Nieznany błąd',
  };
}
