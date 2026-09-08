CREATE TABLE IF NOT EXISTS player_team_fixed_hunt_rooms (
  room_key TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_team_fixed_hunt_rooms_updated_at_idx
  ON player_team_fixed_hunt_rooms (updated_at DESC);
