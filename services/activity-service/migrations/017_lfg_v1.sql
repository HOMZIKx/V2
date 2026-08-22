-- Dungeon LFG v1 (Issue #20 Owner-Accepted closure).

ALTER TABLE participations
  ADD COLUMN IF NOT EXISTS party_role_key TEXT;

ALTER TABLE participations
  DROP CONSTRAINT IF EXISTS participations_party_role_key_check;

ALTER TABLE participations
  ADD CONSTRAINT participations_party_role_key_check
  CHECK (party_role_key IS NULL OR party_role_key IN ('TANK', 'BUFF', 'DPS', 'FLEX'));

CREATE INDEX IF NOT EXISTS participations_activity_party_role_idx
  ON participations (activity_id, party_role_key)
  WHERE party_role_key IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

ALTER TABLE lfg_intents
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE lfg_intents
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS lfg_intent_suppressions (
  intent_id UUID NOT NULL REFERENCES lfg_intents (id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id, activity_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS lfg_full_group_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  recipient_discord_user_id TEXT NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  session_roles TEXT[] NOT NULL DEFAULT '{}',
  class_spec_key TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lfg_full_group_watches_active_idx
  ON lfg_full_group_watches (activity_id, recipient_discord_user_id)
  WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS activity_type_composition_templates (
  organization_id TEXT NOT NULL,
  activity_type_key TEXT NOT NULL,
  party_role_key TEXT NOT NULL,
  required_count INTEGER NOT NULL CHECK (required_count >= 0),
  preferred BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (organization_id, activity_type_key, party_role_key),
  CHECK (party_role_key IN ('TANK', 'BUFF', 'DPS', 'FLEX'))
);

CREATE INDEX IF NOT EXISTS lfg_intents_overlap_lookup_idx
  ON lfg_intents (
    recipient_discord_user_id,
    character_id,
    activity_type_key,
    window_start_at,
    window_end_at
  )
  WHERE cancelled_at IS NULL
    AND fulfilled_at IS NULL
    AND paused_at IS NULL;
