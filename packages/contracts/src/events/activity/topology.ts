/**
 * Shared RabbitMQ topology names for activity projection delivery (P4.5 / D-012).
 * Publisher (activity-service) and consumers (e.g. discord-gateway) must agree.
 */
export const ACTIVITY_EVENTS_EXCHANGE = 'activity.events';
export const ACTIVITY_EVENTS_EXCHANGE_TYPE = 'topic' as const;
export const ACTIVITY_EVENTS_DLX = 'activity.events.dlx';
export const ACTIVITY_PROJECTION_DISCORD_QUEUE = 'activity.projection.discord';
export const ACTIVITY_PROJECTION_DISCORD_DLQ = 'activity.projection.discord.dlq';

/** Binding patterns on `activity.events` for the Discord projection queue. */
export const ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS = [
  'activity.activity.projection_requested.v1',
  'activity.panel.projection_repaired.v1',
] as const;
