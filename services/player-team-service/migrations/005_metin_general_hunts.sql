CREATE TABLE IF NOT EXISTS player_team_metin_general_hunts (
  hunt_key TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO player_team_metin_general_hunts
  (hunt_key, state, revision, updated_by_user_id, updated_at)
SELECT
  room_key,
  (state - 'roomKey') || jsonb_build_object('huntKey', room_key),
  revision,
  updated_by_user_id,
  updated_at
FROM player_team_fixed_hunt_rooms
WHERE room_key IN ('metin-red-las', 'metin-v1', 'general-v1', 'metin-v2', 'general-v2')
ON CONFLICT (hunt_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS player_team_metin_general_hunts_updated_at_idx
  ON player_team_metin_general_hunts (updated_at DESC);
