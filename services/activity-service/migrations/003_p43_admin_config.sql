-- P4.3 Admin API config extensions. No time-based CHECK against now().

ALTER TABLE guild_activity_settings
  ADD COLUMN IF NOT EXISTS config_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allow_other_activity BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_create_horizon_days INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS post_retention_hours_after_finish INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS reminders_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dm_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ping_role_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hub_channel_id TEXT;

ALTER TABLE guild_activity_settings
  ADD COLUMN IF NOT EXISTS allowed_publish_channel_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE guild_activity_settings
  DROP CONSTRAINT IF EXISTS guild_activity_settings_horizon_chk;

ALTER TABLE guild_activity_settings
  ADD CONSTRAINT guild_activity_settings_horizon_chk
  CHECK (max_create_horizon_days >= 1 AND max_create_horizon_days <= 365);

ALTER TABLE guild_activity_settings
  DROP CONSTRAINT IF EXISTS guild_activity_settings_retention_chk;

ALTER TABLE guild_activity_settings
  ADD CONSTRAINT guild_activity_settings_retention_chk
  CHECK (
    post_retention_hours_after_finish >= 1
    AND post_retention_hours_after_finish <= 720
  );

ALTER TABLE guild_activity_settings
  DROP CONSTRAINT IF EXISTS guild_activity_settings_revision_chk;

ALTER TABLE guild_activity_settings
  ADD CONSTRAINT guild_activity_settings_revision_chk
  CHECK (config_revision >= 1);

ALTER TABLE participant_field_defs
  ADD COLUMN IF NOT EXISTS options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_length INTEGER,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE activity_report_reason_defs
  ADD COLUMN IF NOT EXISTS allow_details BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS requires_details BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS activity_type_status_defs (
  type_id UUID NOT NULL REFERENCES activity_types (id) ON DELETE CASCADE,
  status_def_id UUID NOT NULL REFERENCES participation_status_defs (id) ON DELETE CASCADE,
  PRIMARY KEY (type_id, status_def_id)
);

CREATE INDEX IF NOT EXISTS activity_type_status_defs_status_idx
  ON activity_type_status_defs (status_def_id);

CREATE TABLE IF NOT EXISTS activity_type_participant_fields (
  type_id UUID NOT NULL REFERENCES activity_types (id) ON DELETE CASCADE,
  field_def_id UUID NOT NULL REFERENCES participant_field_defs (id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (type_id, field_def_id)
);

CREATE INDEX IF NOT EXISTS activity_type_participant_fields_field_idx
  ON activity_type_participant_fields (field_def_id);

CREATE INDEX IF NOT EXISTS activity_audit_entries_guild_idx
  ON activity_audit_entries (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_audit_entries_action_idx
  ON activity_audit_entries (guild_id, action, created_at DESC);
