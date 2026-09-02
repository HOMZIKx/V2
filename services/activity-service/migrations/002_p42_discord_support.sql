-- P4.2 Discord projection / opaque ids / reports / inbox dedupe.
-- No time-based business CHECKs against now().

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS opaque_id TEXT;

UPDATE activities
SET opaque_id = LEFT(REPLACE(id::text, '-', ''), 12)
WHERE opaque_id IS NULL;

ALTER TABLE activities
  ALTER COLUMN opaque_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activities_opaque_id_uidx
  ON activities (opaque_id);

ALTER TABLE activity_hub_panels
  ADD COLUMN IF NOT EXISTS opaque_id TEXT;

UPDATE activity_hub_panels
SET opaque_id = LEFT(REPLACE(id::text, '-', ''), 12)
WHERE opaque_id IS NULL;

ALTER TABLE activity_hub_panels
  ALTER COLUMN opaque_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activity_hub_panels_opaque_id_uidx
  ON activity_hub_panels (opaque_id);

ALTER TABLE activity_projections
  ADD COLUMN IF NOT EXISTS opaque_id TEXT,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS desired_payload_version INTEGER NOT NULL DEFAULT 1;

UPDATE activity_projections
SET opaque_id = LEFT(REPLACE(activity_id::text, '-', ''), 12)
WHERE opaque_id IS NULL;

ALTER TABLE activity_projections
  ALTER COLUMN opaque_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activity_projections_opaque_id_uidx
  ON activity_projections (opaque_id);

ALTER TABLE guild_activity_settings
  ADD COLUMN IF NOT EXISTS allowed_publish_channel_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS activity_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  reporter_discord_user_id TEXT NOT NULL,
  reason_category TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_reports_guild_idx
  ON activity_reports (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_reports_activity_idx
  ON activity_reports (activity_id, created_at DESC);

-- Idempotent inbox generation when payload carries dedupeKey.
CREATE UNIQUE INDEX IF NOT EXISTS notification_inbox_dedupe_uidx
  ON notification_inbox_items (
    recipient_discord_user_id,
    kind,
    ((payload ->> 'dedupeKey'))
  )
  WHERE recipient_discord_user_id IS NOT NULL
    AND (payload ? 'dedupeKey');

-- Default report reason catalog seed helper table (test/config; Admin replaces in P4.3).
CREATE TABLE IF NOT EXISTS activity_report_reason_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, key)
);
