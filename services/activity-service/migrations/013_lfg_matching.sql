-- Activity 2.0 LFG intents / waiting pool (Issue #20).

CREATE TABLE IF NOT EXISTS lfg_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  recipient_discord_user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  activity_type_key TEXT NOT NULL,
  session_roles TEXT[] NOT NULL DEFAULT '{}',
  window_start_at TIMESTAMPTZ NOT NULL,
  window_end_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  class_spec_key TEXT,
  notification_policy TEXT NOT NULL DEFAULT 'dm_then_inbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lfg_intents_active_idx
  ON lfg_intents (guild_id, activity_type_key, expires_at)
  WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS activity_role_requirements (
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  party_role_key TEXT NOT NULL,
  required_count INTEGER NOT NULL CHECK (required_count >= 0),
  preferred BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (activity_id, party_role_key)
);

CREATE TABLE IF NOT EXISTS lfg_notified_matches (
  recipient_discord_user_id TEXT NOT NULL,
  activity_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_discord_user_id, activity_id, fingerprint)
);
