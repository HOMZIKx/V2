import { z } from 'zod';

export const HealthStatusSchema = z.object({
  status: z.literal('ok'),
  gitCommitSha: z.string().min(1).optional(),
  appVersion: z.string().min(1).optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
