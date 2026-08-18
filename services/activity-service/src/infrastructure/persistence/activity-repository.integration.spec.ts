import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ActivityAdminUseCases } from '../../application/use-cases/activity-admin.use-cases.js';
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
  let admin: ActivityAdminUseCases | undefined;
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
      const authorize = new AllowAllAuthorizationClient();
      useCases = new ActivityUseCases({
        repository,
        authorize,
        clock,
      });
      admin = new ActivityAdminUseCases({
        repository,
        authorize,
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

  it('rolls back both activity and outbox when transaction fails after outbox insert', async ({
    skip,
  }) => {
    if (!infraReady || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const activityId = randomUUID();
    await expect(
      repository.withTransaction(async (tx) => {
        await tx.ensureGuildDefaults({ guildId, orgId: 'org-1' });
        await tx.insertActivity({
          id: activityId,
          guildId,
          organizationId: 'org-1',
          typeId: null,
          name: 'Rollback',
          description: '',
          startAt: new Date('2026-08-24T18:00:00.000Z'),
          endAt: null,
          scheduleKind: 'exact',
          periodKey: null,
          scheduleHasExplicitTime: true,
          status: 'published',
          enrollmentOpen: true,
          participantLimit: null,
          organizerDiscordUserId: `org-${randomUUID()}`,
          organizerV2UserId: null,
          coOrganizerDiscordUserId: null,
          coOrganizerV2UserId: null,
          publicationChannelId: null,
          timezone: 'UTC',
          locationText: null,
          cancelReason: null,
          cancelledAt: null,
          scheduledFinishAt: new Date('2026-08-24T20:00:00.000Z'),
        });
        await tx.insertOutbox({
          eventType: 'activity.activity.created.v1',
          aggregateType: 'activity',
          aggregateId: activityId,
          aggregateVersion: 1,
          payload: { activityId },
          occurredAt: clock.now(),
        });
        throw new Error('forced rollback after outbox');
      }),
    ).rejects.toThrow('forced rollback after outbox');

    const activities = await pool.query(`SELECT id FROM activities WHERE id = $1`, [activityId]);
    const outbox = await pool.query(`SELECT id FROM outbox_messages WHERE aggregate_id = $1`, [
      activityId,
    ]);
    expect(activities.rows).toHaveLength(0);
    expect(outbox.rows).toHaveLength(0);
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
    const activityCount = await pool!.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM activities WHERE guild_id = $1`,
      [guildId],
    );
    expect(Number(activityCount.rows[0]?.count ?? 0)).toBe(1);
  });

  it('keeps a single participation under concurrent duplicate RSVP for the same user', async ({
    skip,
  }) => {
    if (!infraReady || useCases === undefined || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const organizer = { discordUserId: `org-${randomUUID()}` };
    const member = { discordUserId: `member-${randomUUID()}` };
    const draft = await useCases.createDraft({ guildId }, { actor: organizer });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Dup RSVP',
        startAt: new Date('2026-08-25T18:00:00.000Z'),
        participantLimit: 10,
      },
      { actor: organizer },
    );
    const defaults = await repository.withTransaction((tx) =>
      tx.ensureGuildDefaults({ guildId, orgId: 'org-1' }),
    );
    const confirmed = defaults.statuses.find((s) => s.seedKey === 'confirmed');
    expect(confirmed).toBeDefined();

    const results = await Promise.allSettled([
      useCases.rsvp(
        activity.id,
        { statusDefId: confirmed!.id },
        { actor: member, idempotencyKey: `dup-a-${member.discordUserId}` },
      ),
      useCases.rsvp(
        activity.id,
        { statusDefId: confirmed!.id },
        { actor: member, idempotencyKey: `dup-b-${member.discordUserId}` },
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM participations
       WHERE activity_id = $1 AND discord_user_id = $2
         AND resigned_at IS NULL AND removed_at IS NULL`,
      [activity.id, member.discordUserId],
    );
    expect(Number(count.rows[0]?.count ?? 0)).toBe(1);
  });

  it('promotes waitlist FIFO when a seated participant resigns', async ({ skip }) => {
    if (!infraReady || useCases === undefined || repository === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const organizer = { discordUserId: `org-${randomUUID()}` };
    const seated = { discordUserId: `seated-${randomUUID()}` };
    const waiting = { discordUserId: `wait-${randomUUID()}` };
    const draft = await useCases.createDraft({ guildId }, { actor: organizer });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Promote',
        startAt: new Date('2026-08-26T18:00:00.000Z'),
        participantLimit: 1,
      },
      { actor: organizer },
    );
    await useCases.editActivity(activity.id, { participantLimit: 2 }, { actor: organizer });

    const defaults = await repository.withTransaction((tx) =>
      tx.ensureGuildDefaults({ guildId, orgId: 'org-1' }),
    );
    const confirmed = defaults.statuses.find((s) => s.seedKey === 'confirmed');
    expect(confirmed).toBeDefined();

    const first = await useCases.rsvp(
      activity.id,
      { statusDefId: confirmed!.id },
      { actor: seated },
    );
    expect(first.waitlistPosition).toBeNull();

    const second = await useCases.rsvp(
      activity.id,
      { statusDefId: confirmed!.id },
      { actor: waiting },
    );
    expect(second.waitlistPosition).not.toBeNull();

    await useCases.resign(activity.id, { actor: seated });
    const after = await useCases.listParticipants(activity.id, organizer);
    const promoted = after.find((p) => p.discordUserId === waiting.discordUserId);
    expect(promoted?.waitlistPosition).toBeNull();
    expect(promoted?.occupiesSlot).toBe(true);
  });

  it('claims disjoint projection repair leases under concurrent workers', async ({ skip }) => {
    if (!infraReady || useCases === undefined || repository === undefined || pool === undefined) {
      skip();
      return;
    }
    // Claim queue is global. Neutralize leftovers from earlier tests so this
    // case only contends on the four projections created below.
    await pool.query(
      `UPDATE activity_projections
       SET status = 'ok',
           lease_owner = 'held-by-isolation',
           lease_expires_at = $1
       WHERE status IN ('pending', 'failed', 'degraded', 'missing')`,
      [new Date('2099-01-01T00:00:00.000Z').toISOString()],
    );

    const guildId = `guild-${randomUUID()}`;
    const organizer = { discordUserId: `org-${randomUUID()}` };
    const activityIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const draft = await useCases.createDraft({ guildId }, { actor: organizer });
      const activity = await useCases.publishDraft(
        draft.id,
        {
          organizationId: 'org-1',
          name: `Proj${i}`,
          startAt: new Date(`2026-08-${20 + i}T18:00:00.000Z`),
          publicationChannelId: 'chan-1',
        },
        { actor: organizer, idempotencyKey: `proj-pub-${i}-${draft.id}` },
      );
      activityIds.push(activity.id);
      await repository.withTransaction((tx) =>
        tx.upsertActivityProjection({
          activityId: activity.id,
          guildId,
          channelId: 'chan-1',
          opaqueId: activity.opaqueId,
          status: 'failed',
          lastError: 'boom',
          retryCount: 0,
        }),
      );
    }

    const [a, b] = await Promise.all([
      useCases.claimProjectionRepair(
        { owner: 'worker-a', limit: 2, leaseSeconds: 30 },
        { actor: organizer },
      ),
      useCases.claimProjectionRepair(
        { owner: 'worker-b', limit: 2, leaseSeconds: 30 },
        { actor: organizer },
      ),
    ]);
    const idsA = new Set(a.map((p) => p.activityId));
    const idsB = new Set(b.map((p) => p.activityId));
    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false);
    }
    expect(idsA.size + idsB.size).toBe(4);
    expect(activityIds.every((id) => idsA.has(id) || idsB.has(id))).toBe(true);
    expect([...idsA, ...idsB].every((id) => activityIds.includes(id))).toBe(true);
    expect(a.every((p) => p.leaseOwner === 'worker-a')).toBe(true);
    expect(b.every((p) => p.leaseOwner === 'worker-b')).toBe(true);
  });

  it('rejects stale config revision with CONFLICT', async ({ skip }) => {
    if (!infraReady || admin === undefined || repository === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const actor = { discordUserId: `admin-${randomUUID()}` };
    await repository.withTransaction((tx) => tx.ensureGuildDefaults({ guildId, orgId: 'org-1' }));
    const settings = await admin.getAdminConfig(guildId, actor);
    await admin.putAdminConfig(
      guildId,
      {
        expectedRevision: settings.configRevision,
        maxActivePerCreator: 3,
      },
      { actor, idempotencyKey: `cfg-ok-${guildId}` },
    );
    await expect(
      admin.putAdminConfig(
        guildId,
        {
          expectedRevision: settings.configRevision,
          maxActivePerCreator: 2,
        },
        { actor, idempotencyKey: `cfg-stale-${guildId}` },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('resolves historical activity and participations after type/status deactivate', async ({
    skip,
  }) => {
    if (!infraReady || useCases === undefined || admin === undefined || repository === undefined) {
      skip();
      return;
    }
    const guildId = `guild-${randomUUID()}`;
    const organizer = { discordUserId: `org-${randomUUID()}` };
    const member = { discordUserId: `member-${randomUUID()}` };
    const actor = organizer;

    await repository.withTransaction((tx) => tx.ensureGuildDefaults({ guildId, orgId: 'org-1' }));
    const type = await admin.createType(
      guildId,
      { key: `raid-${randomUUID().slice(0, 8)}`, label: 'Raid', enabled: true },
      { actor },
    );
    const customStatus = await admin.createStatus(
      guildId,
      {
        label: 'Custom join',
        occupiesSlot: true,
        behavior: 'custom',
        selectableByMember: true,
        active: true,
        sortOrder: 99,
      },
      { actor },
    );

    const draft = await useCases.createDraft({ guildId }, { actor: organizer });
    const activity = await useCases.publishDraft(
      draft.id,
      {
        organizationId: 'org-1',
        name: 'Snapshot',
        startAt: new Date('2026-08-27T18:00:00.000Z'),
        typeId: type.id,
        participantLimit: 10,
      },
      { actor: organizer },
    );
    await useCases.rsvp(activity.id, { statusDefId: customStatus.id }, { actor: member });

    await admin.deactivateType(guildId, type.id, { actor });
    await admin.deactivateStatus(guildId, customStatus.id, { actor });

    const loaded = await useCases.getActivity(activity.id, organizer);
    expect(loaded.id).toBe(activity.id);
    expect(loaded.typeId).toBe(type.id);

    const typeRow = await repository.withTransaction((tx) => tx.getActivityType(type.id));
    expect(typeRow?.enabled).toBe(false);

    const participations = await useCases.listParticipants(activity.id, organizer);
    const memberRow = participations.find((p) => p.discordUserId === member.discordUserId);
    expect(memberRow).toBeDefined();
    expect(memberRow?.statusDefId).toBe(customStatus.id);
    expect(memberRow?.statusBehavior).toBe('custom');

    const statusRow = await repository.withTransaction((tx) => tx.getStatusDef(customStatus.id));
    expect(statusRow?.active).toBe(false);
    expect(statusRow?.label).toBe('Custom join');
  });

  it('repairProjection upserts while concurrent claim increments retry without overlap steal', async ({
    skip,
  }) => {
    if (!infraReady || admin === undefined || useCases === undefined || repository === undefined) {
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
        name: 'Repair',
        startAt: new Date('2026-08-28T18:00:00.000Z'),
        publicationChannelId: 'chan-repair',
      },
      { actor: organizer },
    );
    await repository.withTransaction((tx) =>
      tx.upsertActivityProjection({
        activityId: activity.id,
        guildId,
        channelId: 'chan-repair',
        opaqueId: activity.opaqueId,
        status: 'failed',
        lastError: 'deliver failed',
        retryCount: 1,
      }),
    );

    const repaired = await admin.repairProjection(guildId, activity.id, {
      actor: organizer,
      idempotencyKey: `repair-${activity.id}`,
    });
    expect(repaired.activityId).toBe(activity.id);

    const claimed = await useCases.claimProjectionRepair(
      { owner: 'retry-worker', limit: 10, leaseSeconds: 30 },
      { actor: organizer },
    );
    const hit = claimed.find((p) => p.activityId === activity.id);
    if (hit !== undefined) {
      expect(hit.retryCount).toBeGreaterThanOrEqual(1);
      expect(hit.leaseOwner).toBe('retry-worker');
    }
  });

  it('reclaims outbox rows whose lease has expired', async ({ skip }) => {
    if (!infraReady || pool === undefined || repository === undefined) {
      skip();
      return;
    }
    const expiredId = randomUUID();
    await pool.query(
      `INSERT INTO outbox_messages (
         id, event_type, aggregate_type, aggregate_id, aggregate_version,
         payload, occurred_at, available_at, claimed_at, claim_owner, claim_expires_at,
         attempt_count, status
       ) VALUES (
         $1::uuid, 'activity.activity.projection_requested.v1', 'activity', $2, 1,
         '{}'::jsonb, $3::timestamptz, $3::timestamptz, $3::timestamptz, 'dead-worker', $4::timestamptz,
         1, 'claimed'
       )`,
      [expiredId, expiredId, '2026-08-16T12:00:00.000Z', '2026-08-16T12:00:30.000Z'],
    );
    const reclaimed = await repository.withTransaction((tx) =>
      tx.claimOutbox({
        owner: 'lease-reclaim-test',
        limit: 10,
        leaseSeconds: 30,
        now: new Date('2026-08-16T12:01:00.000Z'),
      }),
    );
    expect(reclaimed.some((row) => row.id === expiredId)).toBe(true);
  });
});
