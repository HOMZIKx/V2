-- P4 single-form scheduling: exact | range | flexible_period.
-- start_at / end_at remain resolved bounds for sort/expiry.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS schedule_kind TEXT NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS schedule_has_explicit_time BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_schedule_kind_check;

ALTER TABLE activities
  ADD CONSTRAINT activities_schedule_kind_check
  CHECK (schedule_kind IN ('exact', 'range', 'flexible_period'));

ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_period_key_check;

ALTER TABLE activities
  ADD CONSTRAINT activities_period_key_check
  CHECK (
    period_key IS NULL
    OR period_key IN ('today', 'tomorrow', 'this_week', 'weekend', 'flexible')
  );

ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_schedule_period_consistency_check;

ALTER TABLE activities
  ADD CONSTRAINT activities_schedule_period_consistency_check
  CHECK (
    (
      schedule_kind = 'flexible_period'
      AND period_key IS NOT NULL
    )
    OR (
      schedule_kind <> 'flexible_period'
      AND period_key IS NULL
    )
  );
