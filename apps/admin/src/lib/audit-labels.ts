import type { AuditEntryDto } from '../api/activity-admin.js';

const ACTION_LABELS: Readonly<Record<string, string>> = {
  'activity.type.created': 'utworzył typ aktywności',
  'activity.type.updated': 'zmienił typ aktywności',
  'activity.status.created': 'dodał status zapisu',
  'activity.status.updated': 'zmienił status zapisu',
  'activity.config.updated': 'zaktualizował ustawienia',
  'activity.hub.published': 'opublikował Centrum',
  'activity.event.cancelled': 'anulował wydarzenie',
};

export function formatAuditWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatAuditAction(action: string | undefined): string {
  if (action === undefined || action.trim() === '') {
    return 'Wykonał działanie';
  }
  return ACTION_LABELS[action] ?? action.replaceAll('.', ' · ');
}

export function formatAuditObject(entry: AuditEntryDto): string {
  if (entry.entityType !== undefined && entry.entityId !== undefined) {
    return `${entry.entityType}`;
  }
  return entry.entityType ?? '—';
}
