const EVENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  published: 'Opublikowane',
  registrations_open: 'Zapisy otwarte',
  registrations_closed: 'Zapisy zamknięte',
  in_progress: 'W trakcie',
  completed: 'Zakończone',
  cancelled: 'Anulowane',
  draft: 'Szkic',
};

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status] ?? status;
}

export const EVENT_STATUS_FILTER_OPTIONS: readonly {
  readonly value: string;
  readonly label: string;
}[] = [
  { value: '', label: 'Wszystkie' },
  { value: 'published', label: 'Opublikowane' },
  { value: 'registrations_open', label: 'Zapisy otwarte' },
  { value: 'registrations_closed', label: 'Zapisy zamknięte' },
  { value: 'in_progress', label: 'W trakcie' },
  { value: 'completed', label: 'Zakończone' },
  { value: 'cancelled', label: 'Anulowane' },
  { value: 'draft', label: 'Szkic' },
];
