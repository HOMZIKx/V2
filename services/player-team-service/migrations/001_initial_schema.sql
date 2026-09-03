-- Player-team service initial schema
-- Stores per-user workspace state: characters, equipment items, respawn timers, notes and history.

CREATE TABLE IF NOT EXISTS player_team_workspaces (
  id                TEXT        PRIMARY KEY,
  owner_user_id     TEXT        NOT NULL,
  name              TEXT        NOT NULL,
  revision          INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptw_owner_updated
  ON player_team_workspaces (owner_user_id, updated_at DESC);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_team_characters (
  id                    TEXT        PRIMARY KEY,
  workspace_id          TEXT        NOT NULL REFERENCES player_team_workspaces(id) ON DELETE CASCADE,
  owner_user_id         TEXT        NOT NULL,
  name                  TEXT        NOT NULL,
  character_class       TEXT        NOT NULL,
  gender                TEXT        NOT NULL,
  level                 INTEGER,
  responsible_member_id TEXT        NOT NULL,
  note                  TEXT,
  revision              INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptc_workspace
  ON player_team_characters (workspace_id, owner_user_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_team_equipment_items (
  id                       TEXT        PRIMARY KEY,
  workspace_id             TEXT        NOT NULL REFERENCES player_team_workspaces(id) ON DELETE CASCADE,
  owner_user_id            TEXT        NOT NULL,
  name                     TEXT        NOT NULL,
  category                 TEXT        NOT NULL,
  enhancement              INTEGER     NOT NULL DEFAULT 0,
  bonuses                  TEXT[]      NOT NULL DEFAULT '{}',
  planned                  BOOLEAN     NOT NULL DEFAULT FALSE,
  archived                 BOOLEAN     NOT NULL DEFAULT FALSE,
  for_character_class      TEXT,
  level_label              TEXT,
  catalog_layer            TEXT,
  last_confirmed_location  TEXT,
  last_confirmed_by        TEXT,
  last_confirmed_at        TEXT,
  icon_path                TEXT,
  revision                 INTEGER     NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptei_workspace
  ON player_team_equipment_items (workspace_id, owner_user_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_team_equipment_sets (
  id              TEXT        PRIMARY KEY,
  character_id    TEXT        NOT NULL REFERENCES player_team_characters(id) ON DELETE CASCADE,
  workspace_id    TEXT        NOT NULL REFERENCES player_team_workspaces(id) ON DELETE CASCADE,
  owner_user_id   TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT FALSE,
  revision        INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptes_character
  ON player_team_equipment_sets (character_id, workspace_id);

-- slot assignments: one row per slot per set
CREATE TABLE IF NOT EXISTS player_team_set_slots (
  set_id          TEXT  NOT NULL REFERENCES player_team_equipment_sets(id) ON DELETE CASCADE,
  slot            TEXT  NOT NULL,
  item_id         TEXT  NOT NULL REFERENCES player_team_equipment_items(id) ON DELETE CASCADE,
  PRIMARY KEY (set_id, slot)
);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_team_respawn_timers (
  id              TEXT        PRIMARY KEY,
  workspace_id    TEXT        NOT NULL REFERENCES player_team_workspaces(id) ON DELETE CASCADE,
  character_id    TEXT        REFERENCES player_team_characters(id) ON DELETE CASCADE,
  owner_user_id   TEXT        NOT NULL,
  kind            TEXT        NOT NULL,
  label           TEXT        NOT NULL,
  state           TEXT        NOT NULL DEFAULT 'idle',
  started_at      TIMESTAMPTZ,
  done_at         TIMESTAMPTZ,
  window_seconds  INTEGER,
  operation_id    TEXT,
  revision        INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptrt_workspace
  ON player_team_respawn_timers (workspace_id, owner_user_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_team_notes (
  id              TEXT        PRIMARY KEY,
  workspace_id    TEXT        NOT NULL REFERENCES player_team_workspaces(id) ON DELETE CASCADE,
  character_id    TEXT        REFERENCES player_team_characters(id) ON DELETE CASCADE,
  owner_user_id   TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptn_workspace
  ON player_team_notes (workspace_id, owner_user_id, created_at DESC);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS player_team_history (
  id              TEXT        PRIMARY KEY,
  workspace_id    TEXT        NOT NULL REFERENCES player_team_workspaces(id) ON DELETE CASCADE,
  owner_user_id   TEXT        NOT NULL,
  actor_id        TEXT        NOT NULL,
  actor_name      TEXT        NOT NULL,
  actor_initials  TEXT        NOT NULL,
  kind            TEXT        NOT NULL,
  summary         TEXT        NOT NULL,
  detail          JSONB,
  revision        INTEGER     NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pthi_workspace
  ON player_team_history (workspace_id, owner_user_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Snapshot table: stores the entire serialized PlayerStoreState per viewer.
-- Used by the Web dev-sync until per-mutation endpoints replace it.
-- Kept as a separate table so it never conflicts with the relational schema.

CREATE TABLE IF NOT EXISTS player_team_viewer_snapshots (
  owner_user_id   TEXT        PRIMARY KEY,
  state           JSONB       NOT NULL,
  revision        INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
