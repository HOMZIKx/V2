/**
 * Activity → Discord projection RabbitMQ topology (P4.5).
 * Names are immutable once deployed; change requires a new major binding plan.
 */

export const ACTIVITY_EVENTS_EXCHANGE = 'v2.activity.events';
export const ACTIVITY_EVENTS_RETRY_EXCHANGE = 'v2.activity.events.retry';
export const ACTIVITY_EVENTS_DLX = 'v2.activity.events.dlx';

export const DISCORD_ACTIVITY_PROJECTIONS_QUEUE = 'v2.discord.activity.projections';
export const DISCORD_ACTIVITY_PROJECTIONS_RETRY_QUEUE = 'v2.discord.activity.projections.retry';
export const DISCORD_ACTIVITY_PROJECTIONS_DLQ = 'v2.discord.activity.projections.dlq';

/** Main queue binding on activity events exchange. */
export const ACTIVITY_EVENTS_BINDING_KEY = 'activity.#';

/** Default retry TTL before dead-lettering back to main (ms). */
export const ACTIVITY_PROJECTION_RETRY_TTL_MS = 30_000;

export type ActivityRoutingKey =
  | 'activity.activity.created.v1'
  | 'activity.activity.rsvp_changed.v1'
  | 'activity.activity.cancelled.v1'
  | 'activity.activity.schedule_changed.v1'
  | 'activity.activity.waitlist_promoted.v1'
  | 'activity.activity.reconfirm_required.v1'
  | 'activity.activity.finished.v1'
  | 'activity.activity.projection_requested.v1'
  | 'activity.panel.projection_repaired.v1'
  | (string & {});
