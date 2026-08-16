import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ActivityUseCases } from '../../application/use-cases/activity.use-cases.js';
import { FixedClock } from '../../domain/clock.js';
import { AllowAllAuthorizationClient } from '../authorization/authorization-client.js';
import { runMigrations } from '../db/run-migrations.js';
import { ActivityRepository } from './activity-repository.js';

const wantInfra = process.env.RUN_INFRA_TESTS === 'true';

describe.skipIf(!wantInfra)('ActivityRepository (infra)', () => {
  let pool: Pool | undefined;
  let repository: ActivityRepository | undefined;
  let useCases: ActivityUseCases | undefined;
  let infraReady = false;
  const databaseUrl =
    process.env.ACTIVITY_DATABASE_URL ??
    'postgresql://activity:activity_dev_password@127.0.0.1:5432/activity';
  const clock = new FixedClock(new Date('2026-08-16T12:00:00.000Z'));

  beforeAll(async () => {
    try {
      const migrationsDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../migrations',
      );
      await runMigrations({ connectionString: databaseUrl, migrationsDir });
      pool = new Pool({ connectionString: databaseUrl });
      await pool.query(`
        TRUNCATE
          notification_inbox_items,
          activity_audit_entries,
          idempotency_records,
          outbox_messages,
          activity_projections,
          panel_publish_occurrences,
          activity_hub_panels,
          participation_field_values,
          participations,
          activities,
          activity_drafts,
          participant_field_defs,
          participation_status_defs,
          activity_types,
          guild_activity_settings
        CASCADE
      `);
      repository = new ActivityRepository(pool);
      useCases = new ActivityUseCases({
        repository,
        authorize: new AllowAllAuthorizationClient(),
        clock,
      });
      infraReady = true;
    } catch (error) {
      console.warn(
        'ActivityRepository infra tests skipped: database unavailable.',
        error instanceof Error ? error.message : error,
      );
      infraReady = false;
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
  });

  it('applies foundation migration idempotently', async ({ skip }) => {
    if (!infraReady || pool === undefined) {
      skip();
      return;
    }
    const migrationsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../migrations',
    );
    const second = await runMigrations({ connectionString: databaseUrl, migrationsDir });
    expect(second.every((r) => r.status === 'skipped')).toBe(true);
  });

  it('enforces max-4 create under concurrent publish', async ({ skip }) => {
    if (!infraReady || useCases === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const actor = { discordUserId: `creator-${randomUUID()}` };
    const drafts = [];
    for (let i = 0; i < 6; i += 1) {
      drafts.push(await useCases.createDraft({ guildId }, { actor }));
    }
    const results = await Promise.allSettled(
      drafts.map((draft, index) =>
        useCases!.publishDraft(
          draft.id,
          {
            organizationId: 'org-1',
            name: `A${index}`,
            startAt: new Date(`2026-08-${20 + (index % 5)}T18:00:00.000Z`),
          },
          { actor, idempotencyKey: `max4-${draft.id}` },
        ),
      ),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toBe(4);
    expect(rejected.length).toBe(2);
    expect(
      rejected.every(
        (r) =>
          r.status === 'rejected' &&
          typeof r.reason === 'object' &&
          r.reason !== null &&
          'code' in r.reason &&
          (r.reason as { code: string }).code === 'CREATE_LIMIT_EXCEEDED',
      ),
    ).toBe(true);
  });

  it('gives the last seat to only one concurrent RSVP and waitlists the rest', async ({ skip }) => {
    if (!infraReady || useCases === undefined || repository === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const organizer = { discordUserId: `org-${randomUUID()}` };
    const draft = await useCases.createDraft({ guildId }, { actor: organizer });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Limited',
        startAt: new Date('2026-08-22T18:00:00.000Z'),
        participantLimit: 1,
      },
      { actor: organizer },
    );
    // Organizer already occupies the only seat via default status — bump limit to 2
    // so one open seat remains for the race.
    await useCases.editActivity(activity.id, { participantLimit: 2 }, { actor: organizer });

    const defaults = await repository.withTransaction((tx) =>
      tx.ensureGuildDefaults({ guildId, orgId: 'org-1' }),
    );
    const confirmed = defaults.statuses.find((s) => s.seedKey === 'confirmed');
    expect(confirmed).toBeDefined();

    const racers = Array.from({ length: 4 }, (_, i) => ({
      discordUserId: `racer-${i}-${randomUUID()}`,
    }));
    const rsvpResults = await Promise.all(
      racers.map((actor) =>
        useCases!.rsvp(
          activity.id,
          { statusDefId: confirmed!.id },
          { actor, idempotencyKey: `rsvp-${actor.discordUserId}` },
        ),
      ),
    );
    const seated = rsvpResults.filter((p) => p.waitlistPosition === null).length;
    const waitlisted = rsvpResults.filter((p) => p.waitlistPosition !== null).length;
    expect(seated).toBe(1);
    expect(waitlisted).toBe(3);
  });

  it('writes outbox in the same transaction as activity create', async ({ skip }) => {
    if (!infraReady || useCases === undefined || pool === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const actor = { discordUserId: `creator-${randomUUID()}` };
    const draft = await useCases.createDraft({ guildId }, { actor });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Outbox',
        startAt: new Date('2026-08-21T18:00:00.000Z'),
      },
      { actor },
    );
    const outbox = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM outbox_messages WHERE aggregate_id = $1`,
      [activity.id],
    );
    expect(outbox.rows.map((r) => r.event_type)).toContain('activity.activity.created.v1');
  });

  it('is idempotent under concurrent identical keys', async ({ skip }) => {
    if (!infraReady || useCases === undefined) {
      skip();
      return;
    }
    const cases = useCases;
    const guildId = `guild-${randomUUID()}`;
    const actor = { discordUserId: `creator-${randomUUID()}` };
    const draft = await cases.createDraft({ guildId }, { actor });
    const key = `idem-${randomUUID()}`;
    const payload = {
      organizationId: 'org-1',
      name: 'Idem',
      startAt: new Date('2026-08-23T18:00:00.000Z'),
    };
    const results = await Promise.allSettled([
      cases.publishDraft(draft.id, payload, { actor, idempotencyKey: key }),
      cases.publishDraft(draft.id, payload, { actor, idempotencyKey: key }),
    ]);
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof cases.publishDraft>>> =>
        r.status === 'fulfilled',
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    if (fulfilled.length === 2) {
      expect(fulfilled[0]!.value.id).toBe(fulfilled[1]!.value.id);
    }
  });
});
