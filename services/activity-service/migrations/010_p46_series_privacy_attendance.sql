-- P4.6: recurring series, private visibility, attendance records.
-- Forward-only. Activity remains SoT; occurrences are activities linked to a series.

CREATE TABLE IF NOT EXISTS activity_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  home_guild_id TEXT NOT NULL,
  creator_discord_user_id TEXT,
  creator_v2_user_id TEXT,
  recurrence_kind TEXT NOT NULL
    CHECK (recurrence_kind IN ('daily', 'weekly', 'weekdays')),
  -- ISO weekday numbers 1=Mon..7=Sun when recurrence_kind = weekdays; else empty.
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  time_of_day TEXT NOT NULL,
  horizon_end_at TIMESTAMPTZ NOT NULL,
  template_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'completed')),
  opaque_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (recurrence_kind <> 'weekdays' AND cardinality(weekdays) = 0)
    OR (recurrence_kind = 'weekdays' AND cardinality(weekdays) > 0)
  )
);

CREATE INDEX IF NOT EXISTS activity_series_org_guild_idx
  ON activity_series (organization_id, home_guild_id);

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES activity_series (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_occurrence_index INTEGER,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  ADD COLUMN IF NOT EXISTS private_invite_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS private_role_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS activities_series_occurrence_uidx
  ON activities (series_id, series_occurrence_index)
  WHERE series_id IS NOT NULL AND series_occurrence_index IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  subject_discord_user_id TEXT NOT NULL,
  marked_by_discord_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, subject_discord_user_id)
);

CREATE INDEX IF NOT EXISTS activity_attendance_guild_idx
  ON activity_attendance_records (guild_id, marked_at DESC);

COMMENT ON TABLE activity_series IS
  'P4.6 recurring series definition; occurrences are rows in activities';
COMMENT ON TABLE activity_attendance_records IS
  'P4.6 organizer-marked present/absent within 24h; no automatic penalties';
COMMENT ON COLUMN activities.visibility IS
  'public | private; private may use invite token hash and/or role allow-list';
