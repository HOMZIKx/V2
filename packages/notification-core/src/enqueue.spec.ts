import { describe, expect, it } from 'vitest';

import {
  EnqueueNotificationSchema,
  NOTIFICATION_CLASSES,
  isDeliveryAllowedByPreference,
} from './index.js';

describe('notification-core exports', () => {
  it('parses enqueue schema and exposes classes', () => {
    expect(NOTIFICATION_CLASSES).toContain('DISCOVERY');
    const parsed = EnqueueNotificationSchema.parse({
      guildId: 'g1',
      recipientDiscordUserId: 'u1',
      notificationClass: 'TRANSACTIONAL',
      kind: 'activity.cancelled',
      title: 'Anulowano',
      body: 'Powód',
      dedupeKey: 'k1',
    });
    expect(parsed.kind).toBe('activity.cancelled');
    expect(
      isDeliveryAllowedByPreference({
        notificationClass: 'SYSTEM_SECURITY',
        preference: null,
      }),
    ).toBe(true);
  });
});
