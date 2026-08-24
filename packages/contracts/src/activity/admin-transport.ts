import { z } from 'zod';

/** GET /activity/v1/admin/guilds/:guildId/audit query params. */
export const AdminAuditListQuerySchema = z
  .object({
    actionPrefix: z.string().min(1).optional(),
    activityId: z.string().uuid().optional(),
    actorDiscordUserId: z.string().min(1).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

export type AdminAuditListQuery = z.infer<typeof AdminAuditListQuerySchema>;

export const AdminAuditEntrySchema = z
  .object({
    id: z.string().uuid(),
    guildId: z.string().min(1),
    action: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .passthrough();

export const AdminAuditListResponseSchema = z.object({
  items: z.array(AdminAuditEntrySchema),
  total: z.number().int().nonnegative(),
});

export type AdminAuditListResponse = z.infer<typeof AdminAuditListResponseSchema>;
