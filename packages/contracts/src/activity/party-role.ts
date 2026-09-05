import { z } from 'zod';

/** Transport enum shared by Activity LFG HTTP contracts. */
export const PartyRoleKeySchema = z.enum(['TANK', 'BUFF', 'DPS', 'FLEX']);

export type PartyRoleKey = z.infer<typeof PartyRoleKeySchema>;
