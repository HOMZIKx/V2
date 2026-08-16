/**
 * Shared transport contracts only. Business rules belong to individual services.
 */
export { HealthStatusSchema } from './health.js';
export type { HealthStatus } from './health.js';

export {
  ActivityProjectionDeliveryV1Schema,
  type ActivityProjectionDeliveryV1,
} from './events/activity/activity-projection-delivery.v1.js';

export {
  ACTIVITY_EVENTS_DLX,
  ACTIVITY_EVENTS_EXCHANGE,
  ACTIVITY_EVENTS_EXCHANGE_TYPE,
  ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS,
  ACTIVITY_PROJECTION_DISCORD_DLQ,
  ACTIVITY_PROJECTION_DISCORD_QUEUE,
} from './events/activity/topology.js';
