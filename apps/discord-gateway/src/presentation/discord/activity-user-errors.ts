import { ActivityHttpError } from '../../infrastructure/activity/activity-http-client.js';
import { LocalizedDateParseError } from './localized-datetime.js';

const TECHNICAL_LEAK =
  /\b(opaque|activity service|http\/?\d+|statusCode|stack|route|idempotency|assertion|jwt|sql)\b/i;

/**
 * Map internal errors to short Polish player-facing copy.
 * Technical details stay in logs only.
 */
export function toUserFacingError(error: unknown): string {
  if (error instanceof LocalizedDateParseError) {
    return error.message;
  }
  if (error instanceof ActivityHttpError) {
    if (error.code === 'RATE_LIMITED') {
      return 'Zbyt wiele prób. Poczekaj chwilę i spróbuj ponownie.';
    }
    if (error.code === 'NETWORK' || error.code === 'UNAVAILABLE') {
      return 'Usługa jest chwilowo niedostępna. Spróbuj ponownie za moment.';
    }
    const bodyCode = extractErrorCode(error.body);
    if (error.status === 404 || bodyCode === 'NOT_FOUND') {
      return 'Nie znaleziono tej aktywności lub szkicu. Odśwież panel i spróbuj ponownie.';
    }
    if (error.status === 409 || bodyCode === 'CONFLICT') {
      return 'Ta operacja koliduje z innym zapisem. Odśwież widok i spróbuj ponownie.';
    }
    if (error.status === 403 || bodyCode === 'FORBIDDEN') {
      return 'Nie masz uprawnień do tej operacji.';
    }
    if (error.status === 410 || bodyCode === 'GONE') {
      return 'Ten szkic wygasł. Zacznij tworzenie od nowa.';
    }
    if (
      error.status === 400 ||
      bodyCode === 'VALIDATION_FAILED' ||
      bodyCode === 'HORIZON_EXCEEDED'
    ) {
      const detail = extractErrorMessage(error.body);
      if (detail !== null && !TECHNICAL_LEAK.test(detail) && detail.length <= 160) {
        return detail;
      }
      if (bodyCode === 'HORIZON_EXCEEDED') {
        return 'Termin wykracza poza dozwolony horyzont (zwykle 14 dni).';
      }
      return 'Sprawdź wprowadzone dane i spróbuj ponownie.';
    }
    return 'Nie udało się wykonać tej operacji. Spróbuj ponownie.';
  }
  if (error instanceof Error && error.message.length > 0 && !TECHNICAL_LEAK.test(error.message)) {
    if (error.message.length <= 160) {
      return error.message;
    }
  }
  return 'Nie udało się wykonać tej operacji. Spróbuj ponownie.';
}

function extractErrorCode(body: string | undefined): string | null {
  if (body === undefined || body.trim() === '') return null;
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: string };
      code?: string;
    };
    return parsed.error?.code ?? parsed.code ?? null;
  } catch {
    return null;
  }
}

function extractErrorMessage(body: string | undefined): string | null {
  if (body === undefined || body.trim() === '') return null;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    const message = parsed.error?.message ?? parsed.message;
    return typeof message === 'string' ? message : null;
  } catch {
    return null;
  }
}

export function assertNoTechnicalUserCopy(text: string): void {
  if (TECHNICAL_LEAK.test(text)) {
    throw new Error(`User-facing copy leaks technical terms: ${text}`);
  }
}
