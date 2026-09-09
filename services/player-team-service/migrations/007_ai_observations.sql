CREATE TABLE IF NOT EXISTS player_team_ai_observations (
  id UUID PRIMARY KEY,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('equipment', 'economy')),
  actor_hash CHAR(64) NOT NULL,
  workspace_id TEXT NULL,
  character_id TEXT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  confidence DOUBLE PRECISION NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  image_mime_type TEXT NOT NULL CHECK (image_mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image_byte_size INTEGER NOT NULL CHECK (image_byte_size > 0 AND image_byte_size <= 8388608),
  image_sha256 CHAR(64) NOT NULL,
  ai_output JSONB NOT NULL,
  feedback_status TEXT NOT NULL DEFAULT 'pending' CHECK (feedback_status IN ('pending', 'accepted', 'corrected', 'rejected')),
  final_output JSONB NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feedback_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS player_team_ai_observations_type_created_idx
  ON player_team_ai_observations (analysis_type, created_at DESC);

CREATE INDEX IF NOT EXISTS player_team_ai_observations_actor_created_idx
  ON player_team_ai_observations (actor_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS player_team_ai_observations_workspace_created_idx
  ON player_team_ai_observations (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;
