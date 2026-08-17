import { ApiClientError } from './api/http.js';

export function ownerFacingMessage(error: unknown): {
  message: string;
  detail: string | null;
  forbidden: boolean;
  conflict: boolean;
  fields: Readonly<Record<string, string>>;
} {
  if (error instanceof ApiClientError) {
    const conflict =
      error.status === 409 ||
      error.code === 'CONFLICT' ||
      error.code === 'REVISION_CONFLICT' ||
      error.code === 'IDEMPOTENCY_CONFLICT';
    const forbidden = error.isForbidden;
    if (conflict) {
      return {
        message: 'Konfiguracja zmieniła się w międzyczasie. Odśwież dane i spróbuj ponownie.',
        detail: error.message,
        forbidden: false,
        conflict: true,
        fields: error.fields,
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
    return {
      message: error.message,
      detail: `${error.code} · HTTP ${String(error.status)}`,
      forbidden: false,
      conflict: false,
      fields: error.fields,
    };
  }
  if (error instanceof Error) {
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
