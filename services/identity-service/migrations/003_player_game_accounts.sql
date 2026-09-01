-- Player Toolkit foundation (#29): logical game accounts + character grouping.
-- NOT real Metin credentials — organization only.

CREATE TABLE IF NOT EXISTS player_game_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES player_profiles (user_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_game_accounts_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS player_game_accounts_user_idx
  ON player_game_accounts (user_id, display_order ASC, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS player_game_accounts_user_name_active_uidx
  ON player_game_accounts (user_id, lower(display_name))
  WHERE archived_at IS NULL;

ALTER TABLE player_characters
  ADD COLUMN IF NOT EXISTS game_account_id UUID REFERENCES player_game_accounts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS player_characters_game_account_idx
  ON player_characters (game_account_id);

CREATE TABLE IF NOT EXISTS player_private_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_private_audit_user_idx
  ON player_private_audit (user_id, created_at DESC);
