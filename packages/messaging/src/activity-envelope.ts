import { z } from 'zod';

const projectionTargetSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  opaqueProjectionId: z.string().min(1).optional(),
});

export const activityProjectionEnvelopeSchema = z.object({
  envelopeVersion: z.literal(1),
  messageId: z.string().uuid(),
  outboxId: z.string().uuid(),
  eventType: z.string().min(1),
  occurredAt: z.string().min(1),
  organizationId: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().nonnegative(),
  correlationId: z.string().min(1),
  causationId: z.string().min(1).optional(),
  projection: z.object({
    mode: z.enum(['shared', 'separate', 'single']),
    targets: z.array(projectionTargetSchema).min(1),
  }),
  payload: z.record(z.string(), z.unknown()),
});

export type ActivityProjectionEnvelope = z.infer<typeof activityProjectionEnvelopeSchema>;
export type ActivityProjectionTarget = z.infer<typeof projectionTargetSchema>;

export function parseActivityProjectionEnvelope(input: unknown): ActivityProjectionEnvelope {
  return activityProjectionEnvelopeSchema.parse(input);
}

/** messageId is deterministic from outboxId for publisher idempotency. */
export function messageIdFromOutboxId(outboxId: string): string {
  return outboxId;
}
