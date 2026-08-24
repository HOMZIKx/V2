import { z } from 'zod';

import { PartyRoleKeySchema } from './party-role.js';

const isoDateTime = z.string().datetime();

const lfgWindowSchema = z
  .object({
    windowStartAt: isoDateTime,
    windowEndAt: isoDateTime,
  })
  .refine((value) => new Date(value.windowEndAt) > new Date(value.windowStartAt), {
    message: 'windowEndAt must be after windowStartAt',
  });

/** POST /activity/v1/lfg/search — authoritative server request body. */
export const LfgSearchRequestSchema = z
  .object({
    guildId: z.string().min(1),
    organizationId: z.string().min(1),
    activityTypeKey: z.string().min(1),
    characterId: z.string().uuid(),
    sessionRoles: z.array(PartyRoleKeySchema).min(1),
    windowStartAt: isoDateTime,
    windowEndAt: isoDateTime,
  })
  .refine((value) => new Date(value.windowEndAt) > new Date(value.windowStartAt), {
    message: 'windowEndAt must be after windowStartAt',
  });

export type LfgSearchRequest = z.infer<typeof LfgSearchRequestSchema>;

/** POST /activity/v1/lfg/join */
export const LfgJoinRequestSchema = z.object({
  activityId: z.string().uuid(),
  statusDefId: z.string().uuid(),
  partyRoleKey: PartyRoleKeySchema,
  guildId: z.string().min(1).optional(),
  intentId: z.string().uuid().optional(),
  characterId: z.string().uuid().optional(),
  fullGroupWatchId: z.string().uuid().optional(),
});

export type LfgJoinRequest = z.infer<typeof LfgJoinRequestSchema>;

/** POST /activity/v1/lfg/watches */
export const LfgWatchCreateRequestSchema = lfgWindowSchema.and(
  z.object({
    guildId: z.string().min(1),
    organizationId: z.string().min(1),
    characterId: z.string().uuid(),
    activityTypeKey: z.string().min(1),
    sessionRoles: z.array(PartyRoleKeySchema).min(1),
  }),
);

export type LfgWatchCreateRequest = z.infer<typeof LfgWatchCreateRequestSchema>;

/** PATCH /activity/v1/lfg/watches/:id */
export const LfgWatchUpdateRequestSchema = lfgWindowSchema.and(
  z.object({
    guildId: z.string().min(1),
    sessionRoles: z.array(PartyRoleKeySchema).min(1),
  }),
);

export type LfgWatchUpdateRequest = z.infer<typeof LfgWatchUpdateRequestSchema>;

/** POST /activity/v1/lfg/matches/:activityId/suppress */
export const LfgSuppressMatchRequestSchema = z.object({
  guildId: z.string().min(1),
  intentId: z.string().uuid().optional(),
});

export type LfgSuppressMatchRequest = z.infer<typeof LfgSuppressMatchRequestSchema>;

export const LfgMatchOccupancySchema = z.object({
  occupied: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
});

export type LfgMatchOccupancy = z.infer<typeof LfgMatchOccupancySchema>;

/** Single match row returned by POST /activity/v1/lfg/search */
export const LfgSearchMatchSchema = z
  .object({
    activityId: z.string().uuid(),
    opaqueId: z.string().min(1).optional(),
    occupancy: LfgMatchOccupancySchema.optional(),
    roleNeedSummary: z.string().optional(),
    matchReason: z.string().optional(),
    eligiblePartyRoles: z.array(PartyRoleKeySchema).optional(),
    suggestedPartyRole: PartyRoleKeySchema.optional(),
  })
  .passthrough();

export type LfgSearchMatch = z.infer<typeof LfgSearchMatchSchema>;

export const LfgSearchResponseSchema = z.object({
  matches: z.array(LfgSearchMatchSchema),
});

export type LfgSearchResponse = z.infer<typeof LfgSearchResponseSchema>;

/**
 * Legacy consumer drift shape (pre characterId migration).
 * Used by contract tests to ensure obsolete payloads fail validation.
 */
export const LfgSearchRequestLegacyDriftSchema = z.object({
  guildId: z.string().min(1),
  organizationId: z.string().min(1),
  activityTypeKey: z.string().min(1),
  characterClassSpecKey: z.string().min(1),
  characterSupportedRoles: z.array(PartyRoleKeySchema).min(1),
  sessionRoles: z.array(PartyRoleKeySchema).min(1),
  windowStartAt: isoDateTime,
  windowEndAt: isoDateTime,
});
