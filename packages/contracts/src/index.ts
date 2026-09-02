/**
 * Shared transport contracts only. Business rules belong to individual services.
 * Versioned event contracts will be introduced under `events/` when a service
 * publishes its first event.
 */
export { HealthStatusSchema } from './health.js';
export type { HealthStatus } from './health.js';

export {
  AdminAuditEntrySchema,
  AdminAuditListQuerySchema,
  AdminAuditListResponseSchema,
} from './activity/admin-transport.js';
export type { AdminAuditListQuery, AdminAuditListResponse } from './activity/admin-transport.js';

export { PartyRoleKeySchema } from './activity/party-role.js';
export type { PartyRoleKey } from './activity/party-role.js';

export {
  LfgJoinRequestSchema,
  LfgMatchOccupancySchema,
  LfgSearchMatchSchema,
  LfgSearchRequestLegacyDriftSchema,
  LfgSearchRequestSchema,
  LfgSearchResponseSchema,
  LfgSuppressMatchRequestSchema,
  LfgWatchCreateRequestSchema,
  LfgWatchUpdateRequestSchema,
} from './activity/lfg-transport.js';
export type {
  LfgJoinRequest,
  LfgMatchOccupancy,
  LfgSearchMatch,
  LfgSearchRequest,
  LfgSearchResponse,
  LfgSuppressMatchRequest,
  LfgWatchCreateRequest,
  LfgWatchUpdateRequest,
} from './activity/lfg-transport.js';
