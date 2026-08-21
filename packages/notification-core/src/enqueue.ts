import { z } from 'zod';

import { NOTIFICATION_CLASSES } from './policy.js';

export const EnqueueNotificationSchema = z.object({
  guildId: z.string().min(1),
  recipientDiscordUserId: z.string().min(1),
  notificationClass: z.enum(NOTIFICATION_CLASSES),
  kind: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  dedupeKey: z.string().min(1).max(200),
  deepLink: z.string().min(1).max(512).optional(),
  interestKey: z.string().min(1).max(64).optional(),
  activityTypeKey: z.string().min(1).max(100).optional(),
  activityId: z.string().uuid().optional(),
  fingerprint: z.string().min(1).max(200).optional(),
  coalesceSeconds: z.number().int().positive().max(86_400).optional(),
});

export type EnqueueNotificationInput = z.infer<typeof EnqueueNotificationSchema>;
