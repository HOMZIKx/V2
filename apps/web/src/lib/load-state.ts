import { ApiClientError } from './api';

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }
  | { kind: 'forbidden' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string };

export function mapApiError(err: unknown): LoadState {
  if (err instanceof ApiClientError) {
    if (err.isUnauthorized) {
      return { kind: 'unauthorized' };
    }
    if (err.isForbidden) {
      return { kind: 'forbidden' };
    }
    if (err.isNotFound) {
      return { kind: 'not_found' };
    }
    if (err.isConflict) {
      return {
        kind: 'conflict',
        message: 'Dane zmieniły się w międzyczasie. Odśwież i spróbuj ponownie.',
      };
    }
    if (err.isUnavailable || err.status >= 500) {
      return { kind: 'unavailable', message: 'Ta funkcja jest chwilowo niedostępna.' };
    }
    return { kind: 'error', message: 'Nie udało się wczytać danych.' };
  }
  return {
    kind: 'error',
    message: 'Nie udało się wczytać danych.',
  };
}
