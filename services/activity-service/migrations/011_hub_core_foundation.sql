-- Hub Core: legacy structured channel retirement tracking (no auto-delete).

CREATE TABLE IF NOT EXISTS hub_legacy_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL REFERENCES guild_activity_settings (guild_id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  label TEXT NOT NULL,
  related_module_key TEXT,
  status TEXT NOT NULL DEFAULT 'LEGACY_ACTIVE'
    CHECK (status IN ('LEGACY_ACTIVE', 'V2_READY', 'OWNER_CAN_RETIRE')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS hub_legacy_channels_guild_status_idx
  ON hub_legacy_channels (guild_id, status);

-- Optional per-guild module enable overrides (JSON object of moduleKey → boolean).
ALTER TABLE guild_activity_settings
  ADD COLUMN IF NOT EXISTS hub_module_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
