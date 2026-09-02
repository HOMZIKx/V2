-- P4.5: widen activity_projections to one row per (activity_id, guild_id).
-- Forward-only. Existing PK activity_id is replaced with UUID PK + unique pair.

ALTER TABLE activity_projections
  ADD COLUMN IF NOT EXISTS id UUID;

UPDATE activity_projections
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE activity_projections
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

-- Drop old PK if still activity_id-only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'activity_projections'::regclass
      AND contype = 'p'
      AND conname = 'activity_projections_pkey'
  ) THEN
    ALTER TABLE activity_projections DROP CONSTRAINT activity_projections_pkey;
  END IF;
END $$;

ALTER TABLE activity_projections
  ADD CONSTRAINT activity_projections_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS activity_projections_activity_guild_uidx
  ON activity_projections (activity_id, guild_id);

-- opaque_id already unique globally from 002; keep.

COMMENT ON TABLE activity_projections IS
  'P4.5 Discord message projections; unique per activity+guild';
