import {
  ActivityProjectionDeliveryV1Schema,
  type ActivityProjectionDeliveryV1,
} from '@v2/contracts';
import { z } from 'zod';

/** Shared transport envelope from `@v2/contracts` (activity-service publisher ↔ Discord consumer). */
export const projectionDeliveryEnvelopeSchema = ActivityProjectionDeliveryV1Schema;
export type ProjectionDeliveryEnvelope = ActivityProjectionDeliveryV1;

export const hubPayloadSchema = z.object({
  kind: z.literal('hub').optional(),
  channelId: z.string().min(1),
  messageId: z.string().nullable().optional(),
  opaquePanelId: z.string().regex(/^[a-f0-9]{12}$/),
  nonce: z.string().max(25).optional(),
});

export const eventPayloadSchema = z.object({
  kind: z.literal('event').optional(),
  channelId: z.string().min(1),
  messageId: z.string().nullable().optional(),
  opaqueEventId: z.string().regex(/^[a-f0-9]{12}$/),
  name: z.string().min(1),
  typeLabel: z.string().min(1),
  statusLabel: z.string().min(1),
  startAtIso: z.string().min(1),
  endAtIso: z.string().nullable().optional(),
  scheduleLabel: z.string().min(1).nullable().optional(),
  scheduleKind: z.enum(['exact', 'range', 'flexible_period']).optional(),
  periodKey: z
    .enum(['today', 'tomorrow', 'this_week', 'weekend', 'flexible'])
    .nullable()
    .optional(),
  locationText: z.string().nullable().optional(),
  organizerLabel: z.string().min(1),
  coOrganizerLabel: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  occupiedSlots: z.number().int().nonnegative(),
  participantLimit: z.number().int().positive().nullable(),
  statusSummaries: z.array(z.object({ label: z.string(), count: z.number().int() })),
  participantPreview: z.array(z.string()).optional(),
  statusDefs: z.array(
    z.object({
      opaqueId: z.string().regex(/^[a-f0-9]{12}$/),
      label: z.string().min(1),
      occupiesSlot: z.boolean(),
    }),
  ),
  rsvpDisabled: z.boolean().optional(),
  secondaryDisabled: z.boolean().optional(),
  nonce: z.string().max(25).optional(),
});

export type ProjectionDeliveryResult = {
  readonly status: 'delivered' | 'duplicate' | 'rate_limited' | 'upstream_error' | 'rejected';
  readonly outboxId: string;
  readonly messageId?: string;
  readonly channelId?: string;
  readonly detail?: string;
};

export function classifyDiscordProjectionError(
  outboxId: string,
  error: unknown,
): ProjectionDeliveryResult {
  const message = error instanceof Error ? error.message : 'unknown';
  let statusCode: number | undefined;
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      statusCode = error.status;
    } else if ('httpStatus' in error && typeof error.httpStatus === 'number') {
      statusCode = error.httpStatus;
    }
  }

  if (statusCode === 429 || /429|rate.?limit/i.test(message)) {
    return { status: 'rate_limited', outboxId, detail: message };
  }
  if ((statusCode !== undefined && statusCode >= 500) || /5\d\d|ECONN|timeout/i.test(message)) {
    return { status: 'upstream_error', outboxId, detail: message };
  }
  return { status: 'rejected', outboxId, detail: message };
}

export function isRetryableProjectionStatus(status: ProjectionDeliveryResult['status']): boolean {
  return status === 'rate_limited' || status === 'upstream_error';
}
