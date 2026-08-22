-- LFG audit fixes: actor-level Nie teraz without intent.

CREATE TABLE IF NOT EXISTS lfg_actor_match_suppressions (
  recipient_discord_user_id TEXT NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_discord_user_id, activity_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS lfg_actor_match_suppressions_recipient_idx
  ON lfg_actor_match_suppressions (recipient_discord_user_id);
