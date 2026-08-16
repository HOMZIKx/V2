import { z } from 'zod';

/**
 * Transport envelope for activity → Discord projection delivery (P4.5).
 * Matches the body historically POSTed by ActivityOutboxDispatcher to
 * `/internal/activity/v1/projections/deliver`. Payload stays opaque
 * (`Record<string, unknown>`) — full DB models must not be embedded here.
 */
export const ActivityProjectionDeliveryV1Schema = z.object({
  outboxId: z.string().min(1),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
  attemptCount: z.number().int().nonnegative().optional(),
  correlationId: z.string().min(1).optional(),
  guildId: z.string().min(1).optional(),
});

export type ActivityProjectionDeliveryV1 = z.infer<typeof ActivityProjectionDeliveryV1Schema>;
