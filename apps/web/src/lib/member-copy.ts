import { ApiClientError } from './api';
import { isHistoricalLifecycle } from './labels';
import type { ActivityDto } from './types';

export type MyActivityBucket = 'upcoming' | 'needs_attention' | 'completed';

export const MY_ACTIVITY_BUCKET_LABELS: Record<MyActivityBucket, string> = {
  upcoming: 'Nadchodzące',
  needs_attention: 'Wymagają uwagi',
  completed: 'Zakończone',
};

export function bucketMyActivity(activity: ActivityDto): MyActivityBucket {
  if (isHistoricalLifecycle(activity.status)) {
    return 'completed';
  }
  if (activity.myParticipationStatus?.confirmationState === 'requires_reconfirmation') {
    return 'needs_attention';
  }
  return 'upcoming';
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

export function memberErrorCopy(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.isUnauthorized) {
      return 'Sesja wygasła.';
    }
    if (err.isForbidden) {
      return 'Nie masz dostępu do tego serwera.';
    }
    if (err.isNotFound) {
      return 'Ta aktywność już nie istnieje.';
    }
    if (err.isConflict) {
      return 'Dane zmieniły się w międzyczasie. Odśwież i spróbuj ponownie.';
    }
    if (err.isUnavailable || err.status >= 500) {
      return 'Ta funkcja jest chwilowo niedostępna.';
    }
  }
  return 'Nie udało się wczytać danych.';
}

export function rsvpFeedbackCopy(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'CAPACITY_EXCEEDED' || err.isConflict) {
      return 'Dane zmieniły się w międzyczasie. Odśwież i spróbuj ponownie.';
    }
    if (err.isForbidden) {
      return 'Nie masz dostępu do tej akcji.';
    }
    if (err.isUnauthorized) {
      return 'Sesja wygasła.';
    }
    if (err.isUnavailable || err.status >= 500) {
      return 'Ta funkcja jest chwilowo niedostępna.';
    }
  }
  return 'Nie udało się zapisać zmiany.';
}

export const GUILD_UNAVAILABLE_COPY =
  'Brak przypisanego serwera Discord dla tego portalu. Skontaktuj się z administracją — serwer musi być skonfigurowany przy wdrożeniu WWW (nie da się dodać go samodzielnie w tej wersji).';
