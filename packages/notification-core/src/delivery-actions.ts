import { z } from 'zod';

const partyRole = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);

/** Optional Discord DM action payload — template-specific, validated at delivery time. */
export const NotificationDeliveryActionsSchema = z.object({
  template: z.enum(['lfg_match', 'lfg_slot_reopened']),
  activityId: z.string().uuid(),
  activityOpaqueId: z.string().regex(/^[a-f0-9]{12}$/),
  guildId: z.string().min(1),
  organizationId: z.string().min(1),
  activityTypeKey: z.string().min(1),
  fingerprint: z.string().min(1).max(200),
  intentId: z.string().uuid().optional(),
  suggestedPartyRole: partyRole.optional(),
  eligiblePartyRoles: z.array(partyRole).min(1).max(4).optional(),
});

export type NotificationDeliveryActions = z.infer<typeof NotificationDeliveryActionsSchema>;
