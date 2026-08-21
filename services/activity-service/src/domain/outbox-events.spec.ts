import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ACCEPTED_OUTBOX_EVENT_TYPES, OUTBOX_EVENT_TYPES } from './outbox-events.js';

const domainDir = dirname(fileURLToPath(import.meta.url));

describe('outbox-events catalog', () => {
  it('lists the accepted activity/panel event types', () => {
    expect(ACCEPTED_OUTBOX_EVENT_TYPES).toEqual([
      OUTBOX_EVENT_TYPES.CREATED,
      OUTBOX_EVENT_TYPES.RSVP_CHANGED,
      OUTBOX_EVENT_TYPES.CANCELLED,
      OUTBOX_EVENT_TYPES.SCHEDULE_CHANGED,
      OUTBOX_EVENT_TYPES.WAITLIST_PROMOTED,
      OUTBOX_EVENT_TYPES.RECONFIRM_REQUIRED,
      OUTBOX_EVENT_TYPES.FINISHED,
      OUTBOX_EVENT_TYPES.PROJECTION_REQUESTED,
      OUTBOX_EVENT_TYPES.PANEL_PROJECTION_REPAIRED,
      OUTBOX_EVENT_TYPES.NOTIFICATION_DELIVER,
    ]);
  });

  it('ensures every eventType string used by use-cases is in the catalog', () => {
    const useCaseDir = join(domainDir, '../application/use-cases');
    const files = readdirSync(useCaseDir).filter(
      (name) => name.endsWith('.use-cases.ts') && !name.endsWith('.spec.ts'),
    );
    const catalog = new Set<string>(ACCEPTED_OUTBOX_EVENT_TYPES);
    const literalPattern = /eventType:\s*['"]([^'"]+)['"]/g;
    const constantPattern = /eventType:\s*OUTBOX_EVENT_TYPES\.([A-Z0-9_]+)/g;

    for (const file of files) {
      const source = readFileSync(join(useCaseDir, file), 'utf8');
      for (const match of source.matchAll(literalPattern)) {
        const eventType = match[1] ?? '';
        expect(catalog.has(eventType), `${file} uses unknown literal ${eventType}`).toBe(true);
      }
      for (const match of source.matchAll(constantPattern)) {
        const key = match[1] as keyof typeof OUTBOX_EVENT_TYPES;
        expect(OUTBOX_EVENT_TYPES[key], `${file} uses unknown constant ${key}`).toBeDefined();
        expect(catalog.has(OUTBOX_EVENT_TYPES[key])).toBe(true);
      }
    }
  });
});

describe('domain guild id hardcoding', () => {
  it('contains no Discord snowflake literals in domain/', () => {
    const snowflake = /\b\d{17,20}\b/;
    const files = readdirSync(domainDir).filter((name) => name.endsWith('.ts'));
    for (const file of files) {
      const source = readFileSync(join(domainDir, file), 'utf8');
      expect(snowflake.test(source), `${file} must not hardcode Discord snowflakes`).toBe(false);
    }
  });
});
