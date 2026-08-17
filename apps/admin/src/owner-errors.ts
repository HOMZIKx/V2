import { ApiClientError } from './api/http.js';
import { ApiNetworkError, isRawFetchFailureMessage } from './api/network-error.js';

export const ACTIVITY_SERVICE_UNAVAILABLE = 'Nie udało się połączyć z usługą Centrum Aktywności.';

export function ownerFacingMessage(error: unknown): {
  message: string;
  detail: string | null;
  forbidden: boolean;
  conflict: boolean;
  fields: Readonly<Record<string, string>>;
} {
  if (error instanceof ApiNetworkError) {
    const url = new URL(error.url);
    return {
      message: ACTIVITY_SERVICE_UNAVAILABLE,
      detail: `${error.kind} · ${error.method} ${url.origin}${url.pathname}`,
      forbidden: false,
      conflict: false,
      fields: {},
    };
  }

  if (error instanceof ApiClientError) {
    const conflict =
      error.status === 409 ||
      error.code === 'CONFLICT' ||
      error.code === 'REVISION_CONFLICT' ||
      error.code === 'IDEMPOTENCY_CONFLICT';
    const forbidden = error.isForbidden;
    if (conflict) {
      const duplicateTypeKey =
        error.message.toLowerCase().includes('activity type key') ||
        error.message.toLowerCase().includes('key already exists');
      return {
        message: duplicateTypeKey
          ? 'Typ o tej nazwie już istnieje. Zmień nazwę lub użyj innej w zaawansowanych ustawieniach.'
          : 'Konfiguracja zmieniła się w międzyczasie. Odśwież dane i spróbuj ponownie.',
        detail: error.message,
        forbidden: false,
        conflict: true,
        fields:
          duplicateTypeKey && error.fields.key === undefined
            ? { key: 'Klucz jest już zajęty w tym serwerze.' }
            : error.fields,
      };
    }
    if (forbidden) {
      return {
        message: 'Nie masz uprawnień do tej operacji.',
        detail: error.message,
        forbidden: true,
        conflict: false,
        fields: error.fields,
      };
    }
    if (error.status === 401 || error.code === 'UNAUTHENTICATED') {
      return {
        message: 'Nie udało się potwierdzić sesji.',
        detail: `${error.code} · HTTP ${String(error.status)}`,
        forbidden: false,
        conflict: false,
        fields: error.fields,
      };
    }
    return {
      message: isRawFetchFailureMessage(error.message)
        ? ACTIVITY_SERVICE_UNAVAILABLE
        : error.message,
      detail: `${error.code} · HTTP ${String(error.status)}`,
      forbidden: false,
      conflict: false,
      fields: error.fields,
    };
  }
  if (error instanceof Error) {
    if (isRawFetchFailureMessage(error.message)) {
      return {
        message: ACTIVITY_SERVICE_UNAVAILABLE,
        detail: error.message,
        forbidden: false,
        conflict: false,
        fields: {},
      };
    }
    return {
      message: error.message,
      detail: null,
      forbidden: false,
      conflict: false,
      fields: {},
    };
  }
  return {
    message: 'Nie udało się wykonać operacji.',
    detail: null,
    forbidden: false,
    conflict: false,
    fields: {},
  };
}
