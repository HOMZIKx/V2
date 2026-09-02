-- Hub Core / Issue #27 foundation: player profile, characters, interests.
-- Interest ≠ Discord role ≠ notification preference.

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  active_character_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES player_profiles (user_id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  class_spec_key TEXT NOT NULL,
  level INTEGER CHECK (level IS NULL OR (level >= 1 AND level <= 999)),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_characters_user_idx ON player_characters (user_id);

CREATE TABLE IF NOT EXISTS player_character_party_roles (
  character_id UUID NOT NULL REFERENCES player_characters (id) ON DELETE CASCADE,
  party_role_key TEXT NOT NULL,
  PRIMARY KEY (character_id, party_role_key)
);

CREATE TABLE IF NOT EXISTS interest_catalog (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_interests (
  user_id TEXT NOT NULL REFERENCES player_profiles (user_id) ON DELETE CASCADE,
  interest_key TEXT NOT NULL REFERENCES interest_catalog (key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, interest_key)
);

-- Guild-scoped interest → Discord role projection mapping (safety enforced in app).
CREATE TABLE IF NOT EXISTS interest_role_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  interest_key TEXT NOT NULL REFERENCES interest_catalog (key) ON DELETE CASCADE,
  discord_role_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, interest_key)
);

CREATE TABLE IF NOT EXISTS interest_role_projection_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  interest_key TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO interest_catalog (key, label, enabled, sort_order)
VALUES
  ('azrael', 'Azrael', TRUE, 10),
  ('smok', 'Smok', TRUE, 20),
  ('wb', 'World Boss', TRUE, 30),
  ('ox', 'OX', TRUE, 40),
  ('pvm', 'PvM', TRUE, 50),
  ('pvp', 'PvP', TRUE, 60)
ON CONFLICT (key) DO NOTHING;
