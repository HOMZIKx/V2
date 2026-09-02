-- P4.5: participant_mode on activities (shared | separate).
-- Additive only. Default shared preserves single-guild semantics.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS participant_mode TEXT NOT NULL DEFAULT 'shared';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_participant_mode_check'
  ) THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_participant_mode_check
      CHECK (participant_mode IN ('shared', 'separate'));
  END IF;
END $$;

COMMENT ON COLUMN activities.participant_mode IS
  'P4.5 per-activity participant pool: shared=one pool; separate=per guild';
