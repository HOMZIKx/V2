-- Technical audit: prevent double-booking races on reservation spots (half-open intervals).
-- Product lifecycle semantics remain Owner Discovery — this is a safety invariant only.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS spot_time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

CREATE INDEX IF NOT EXISTS reservations_spot_time_range_gist_idx
  ON reservations
  USING gist (spot_id, spot_time_range)
  WHERE status IN ('pending', 'confirmed');

-- Serialized exclusion: no overlapping active reservations on the same spot.
DO $$
BEGIN
  ALTER TABLE reservations
    ADD CONSTRAINT reservations_spot_no_overlap
    EXCLUDE USING gist (
      spot_id WITH =,
      spot_time_range WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
