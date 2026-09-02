export function formatEventCapacity(
  occupiedSlots: number | undefined,
  participantLimit: number | null,
): string {
  if (participantLimit === null) {
    return occupiedSlots === undefined
      ? 'Miejsca: bez limitu'
      : `Miejsca: bez limitu · zapisanych: ${occupiedSlots}`;
  }
  if (occupiedSlots === undefined) {
    return `Miejsca: —/${participantLimit}`;
  }
  return `Miejsca: ${occupiedSlots}/${participantLimit}`;
}

export function organizerDisplayName(activity: { organizerDisplay?: string | null }): string {
  const value = activity.organizerDisplay?.trim();
  return value !== undefined && value.length > 0 ? value : 'nieznany użytkownik';
}

export function participantDisplayName(participant: { displayName?: string | null }): string {
  const value = participant.displayName?.trim();
  return value !== undefined && value.length > 0 ? value : 'nieznany użytkownik';
}
