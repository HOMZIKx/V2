-- Shared Timers + Party rooms (REST + polling). No separate hunt-sync service.

CREATE TABLE IF NOT EXISTS player_team_party_rooms (
  id              TEXT        PRIMARY KEY,
  join_code       TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  leader_id       TEXT        NOT NULL,
  visibility      TEXT        NOT NULL CHECK (visibility IN ('open', 'closed')),
  map_key         TEXT        NOT NULL,
  active_channel  INTEGER     NOT NULL DEFAULT 1,
  session_kills   INTEGER     NOT NULL DEFAULT 0,
  members         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  requests        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  pins            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  revision        INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptpr_join_code
  ON player_team_party_rooms (join_code);

CREATE INDEX IF NOT EXISTS idx_ptpr_updated
  ON player_team_party_rooms (updated_at DESC);

CREATE TABLE IF NOT EXISTS player_team_timer_rooms (
  id              TEXT        PRIMARY KEY,
  map_key         TEXT        NOT NULL,
  channel         INTEGER     NOT NULL,
  room_code       TEXT,
  timers          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  applied_ops     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  revision        INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique room per map+channel+optional room_code (NULL room_code = public map channel).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pttr_scope
  ON player_team_timer_rooms (map_key, channel, COALESCE(room_code, ''));

CREATE INDEX IF NOT EXISTS idx_pttr_updated
  ON player_team_timer_rooms (updated_at DESC);
