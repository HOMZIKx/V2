-- Shared workspace snapshot used by collaborative Web views (EQ / timers / notes).
-- Unlike player_team_viewer_snapshots this row is shared by every authorised workspace member.

CREATE TABLE IF NOT EXISTS player_team_workspace_snapshots (
  workspace_id        TEXT        PRIMARY KEY,
  state               JSONB       NOT NULL,
  revision            INTEGER     NOT NULL DEFAULT 0,
  updated_by_user_id  TEXT        NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptws_updated
  ON player_team_workspace_snapshots (updated_at DESC);
