-- P4.5: publication targets (multi-guild Discord destinations).
-- Backfill one target from home guild + publication_channel_id / projection.

CREATE TABLE IF NOT EXISTS activity_publication_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  participant_limit INTEGER
    CHECK (participant_limit IS NULL OR participant_limit > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, guild_id)
);

CREATE INDEX IF NOT EXISTS activity_publication_targets_org_idx
  ON activity_publication_targets (organization_id, guild_id);

-- Backfill from existing activities that have a publication channel or projection.
INSERT INTO activity_publication_targets (
  activity_id,
  organization_id,
  guild_id,
  channel_id,
  participant_limit,
  sort_order
)
SELECT
  a.id,
  a.organization_id,
  a.guild_id,
  COALESCE(a.publication_channel_id, p.channel_id, ''),
  a.participant_limit,
  0
FROM activities a
LEFT JOIN activity_projections p ON p.activity_id = a.id
WHERE COALESCE(a.publication_channel_id, p.channel_id, '') <> ''
ON CONFLICT (activity_id, guild_id) DO NOTHING;

COMMENT ON TABLE activity_publication_targets IS
  'P4.5 Discord guild+channel destinations for activity projections';
