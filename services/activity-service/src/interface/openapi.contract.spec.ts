import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const openApiPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../openapi/activity-v1.yaml',
);

describe('OpenAPI activity-v1 contract', () => {
  const raw = readFileSync(openApiPath, 'utf8');

  it('declares /activity/v1 foundation paths', () => {
    expect(raw).toContain('openapi: 3.1.0');
    expect(raw).toContain('/activity/v1/drafts');
    expect(raw).toContain('/activity/v1/drafts/{id}/publish');
    expect(raw).toContain('/activity/v1/activities/{id}/rsvp');
    expect(raw).toContain('/activity/v1/activities/{id}/reschedule');
    expect(raw).toContain('/activity/v1/activities/{id}/reconfirm');
    expect(raw).toContain('/activity/v1/outbox/claim');
    expect(raw).toContain('/activity/v1/panels');
    expect(raw).toContain('IdempotencyKey');
  });

  it('declares P4.2 Discord support paths', () => {
    expect(raw).toContain('/activity/v1/inbox');
    expect(raw).toContain('/activity/v1/inbox/{id}/read');
    expect(raw).toContain('/activity/v1/activities/by-opaque/{opaqueId}');
    expect(raw).toContain('/activity/v1/panels/by-opaque/{opaqueId}');
    expect(raw).toContain('/activity/v1/activities/{id}/reports');
    expect(raw).toContain('/activity/v1/guilds/{guildId}/reports');
    expect(raw).toContain('/activity/v1/activities/{id}/projection');
    expect(raw).toContain('/activity/v1/test/seed-guild');
    expect(raw).toContain('activity.activity.projection_requested.v1');
  });

  it('does not invent Discord-specific API paths', () => {
    expect(raw).not.toContain('/discord/');
    expect(raw).not.toContain('slash-command');
  });
});
