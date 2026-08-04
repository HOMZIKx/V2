/**
 * Shared transport contracts only. Business rules belong to individual services.
 * Versioned event contracts will be introduced under `events/` when a service
 * publishes its first event.
 */
export { HealthStatusSchema } from './health.js';
export type { HealthStatus } from './health.js';
