/**
 * Accepted transactional-outbox event types for activity-service.
 * Namespace `activity.activity.*.v1` is intentional (service.entity.action).
 * Keep in sync with OpenAPI `ActivityEventNames` and CENTRUM_AKTYWNOSCI docs.
 */
export const OUTBOX_EVENT_TYPES = {
  CREATED: 'activity.activity.created.v1',
  RSVP_CHANGED: 'activity.activity.rsvp_changed.v1',
  CANCELLED: 'activity.activity.cancelled.v1',
  SCHEDULE_CHANGED: 'activity.activity.schedule_changed.v1',
  WAITLIST_PROMOTED: 'activity.activity.waitlist_promoted.v1',
  RECONFIRM_REQUIRED: 'activity.activity.reconfirm_required.v1',
  FINISHED: 'activity.activity.finished.v1',
  PROJECTION_REQUESTED: 'activity.activity.projection_requested.v1',
  PANEL_PROJECTION_REPAIRED: 'activity.panel.projection_repaired.v1',
  NOTIFICATION_DELIVER: 'activity.notification.deliver.v1',
} as const;

export const ACCEPTED_OUTBOX_EVENT_TYPES = [
  OUTBOX_EVENT_TYPES.CREATED,
  OUTBOX_EVENT_TYPES.RSVP_CHANGED,
  OUTBOX_EVENT_TYPES.CANCELLED,
  OUTBOX_EVENT_TYPES.SCHEDULE_CHANGED,
  OUTBOX_EVENT_TYPES.WAITLIST_PROMOTED,
  OUTBOX_EVENT_TYPES.RECONFIRM_REQUIRED,
  OUTBOX_EVENT_TYPES.FINISHED,
  OUTBOX_EVENT_TYPES.PROJECTION_REQUESTED,
  OUTBOX_EVENT_TYPES.PANEL_PROJECTION_REPAIRED,
  OUTBOX_EVENT_TYPES.NOTIFICATION_DELIVER,
] as const;

export type AcceptedOutboxEventType = (typeof ACCEPTED_OUTBOX_EVENT_TYPES)[number];

export function isAcceptedOutboxEventType(value: string): value is AcceptedOutboxEventType {
  return (ACCEPTED_OUTBOX_EVENT_TYPES as readonly string[]).includes(value);
}
