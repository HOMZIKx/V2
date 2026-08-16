export const ACTIVITY_LIFECYCLE_LABELS: Readonly<Record<string, string>> = {
  draft: 'Szkic',
  published: 'Opublikowana',
  registrations_open: 'Zapisy otwarte',
  registrations_closed: 'Zapisy zamknięte',
  in_progress: 'W trakcie',
  completed: 'Zakończona',
  cancelled: 'Anulowana',
  deleted: 'Usunięta',
  rescheduled: 'Przełożona',
};

export const INBOX_KIND_LABELS: Readonly<Record<string, string>> = {
  waitlist: 'Lista rezerwowa',
  waitlist_promoted: 'Lista rezerwowa',
  reconfirm: 'Ponowne potwierdzenie',
  reconfirmation: 'Ponowne potwierdzenie',
  cancelled: 'Anulowanie',
  cancel: 'Anulowanie',
  reschedule: 'Zmiana terminu',
};

export function lifecycleLabel(status: string | null | undefined): string {
  if (status === undefined || status === null || status.trim() === '') {
    return 'Nieznany status';
  }
  return ACTIVITY_LIFECYCLE_LABELS[status] ?? status;
}

export function inboxKindLabel(kind: string | null | undefined): string {
  if (kind === undefined || kind === null || kind.trim() === '') {
    return 'Powiadomienie';
  }
  return INBOX_KIND_LABELS[kind] ?? 'Powiadomienie';
}

export function isHistoricalLifecycle(status: string): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'deleted';
}
