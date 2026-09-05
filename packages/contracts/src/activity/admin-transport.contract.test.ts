import { describe, expect, it } from 'vitest';

import { AdminAuditListQuerySchema, AdminAuditListResponseSchema } from './admin-transport.js';

describe('Admin audit transport contracts', () => {
  it('uses offset pagination (not cursor)', () => {
    expect(AdminAuditListQuerySchema.safeParse({ offset: 50, limit: 50 }).success).toBe(true);
    expect(AdminAuditListQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(false);
  });

  it('returns items + total (not nextCursor)', () => {
    const parsed = AdminAuditListResponseSchema.safeParse({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          guildId: '222222222222222222',
          action: 'activity.created',
          createdAt: '2026-08-22T10:00:00.000Z',
        },
      ],
      total: 1,
    });
    expect(parsed.success).toBe(true);
    expect(AdminAuditListResponseSchema.safeParse({ items: [], nextCursor: null }).success).toBe(
      false,
    );
  });
});
