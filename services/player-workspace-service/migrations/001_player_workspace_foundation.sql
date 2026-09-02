-- Player Workspace foundation (D-051 / D-052)
-- Owns Team collaboration + Character Boards. Does NOT store EQ/Sets/Trackers.

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  created_by_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REMOVED')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_user_active_idx
  ON team_members (user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS team_members_team_active_idx
  ON team_members (team_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL,
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  operation_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_pending_unique_idx
  ON team_invitations (team_id, target_user_id)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_operation_id_uidx
  ON team_invitations (operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS team_invitations_target_pending_idx
  ON team_invitations (target_user_id)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS team_character_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 24),
  class_spec_key TEXT NOT NULL,
  level INTEGER CHECK (level IS NULL OR (level >= 1 AND level <= 999)),
  linked_player_character_id UUID,
  created_by_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS team_character_boards_team_active_idx
  ON team_character_boards (team_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS team_mutation_idempotency (
  operation_id TEXT PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
