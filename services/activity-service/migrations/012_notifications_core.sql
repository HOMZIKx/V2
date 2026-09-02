-- Stage 4 Notifications Core (Issue #24) — Activity-hosted SoT.

ALTER TABLE notification_inbox_items
  ADD COLUMN IF NOT EXISTS notification_class TEXT NOT NULL DEFAULT 'TRANSACTIONAL'
    CHECK (notification_class IN ('DISCOVERY', 'TRANSACTIONAL', 'SYSTEM_SECURITY')),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS deep_link TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS interest_key TEXT,
  ADD COLUMN IF NOT EXISTS activity_id UUID;

CREATE TABLE IF NOT EXISTS notification_preferences (
  guild_id TEXT NOT NULL,
  recipient_discord_user_id TEXT NOT NULL,
  dm_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  muted_interest_keys TEXT[] NOT NULL DEFAULT '{}',
  muted_activity_type_keys TEXT[] NOT NULL DEFAULT '{}',
  muted_activity_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, recipient_discord_user_id)
);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_item_id UUID NOT NULL REFERENCES notification_inbox_items (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('DM', 'INBOX')),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'delivered', 'failed', 'skipped', 'fallback_inbox')
  ),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_delivery_item_idx
  ON notification_delivery_attempts (inbox_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_dedupe_memory (
  recipient_discord_user_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_discord_user_id, dedupe_key)
);
