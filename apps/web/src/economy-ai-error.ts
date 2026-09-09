export function economyAiErrorMessage(
  error: string | undefined,
  retryAfterSeconds?: number | null,
): string {
  switch (error) {
    case 'ai_not_configured':
      return 'AI nie jest skonfigurowane w tym wdrożeniu.';
    case 'ai_quota_exceeded': {
      const retry =
        typeof retryAfterSeconds === 'number' &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds > 0
          ? ` Spróbuj ponownie za ${Math.ceil(retryAfterSeconds)} s.`
          : ' Spróbuj ponownie za chwilę.';
      return `Limit AI Gemini jest chwilowo wyczerpany.${retry}`;
    }
    case 'rate_limited':
      return 'Za dużo prób rozpoznawania. Odczekaj kilka minut i spróbuj ponownie.';
    case 'invalid_image':
      return 'Nie udało się odczytać obrazu. Użyj PNG, JPG/JPEG albo WEBP.';
    case 'ai_empty_result':
      return 'AI nie zwróciło wyniku dla tego screena. Spróbuj ponownie.';
    case 'ai_invalid_result':
      return 'AI zwróciło nieprawidłowy wynik. Spróbuj ponownie.';
    case 'ai_unavailable':
      return 'Usługa AI jest chwilowo niedostępna. Spróbuj ponownie za chwilę.';
    case 'unauthorized':
      return 'Sesja wygasła. Odśwież stronę i zaloguj się ponownie.';
    default:
      return 'Nie udało się przeanalizować screena. Spróbuj ponownie.';
  }
}
