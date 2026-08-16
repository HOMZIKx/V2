-- P4.1 activity foundation schema. No time-based CHECK against now().

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE activity_status AS ENUM (
  'draft',
  'published',
  'registrations_open',
  'registrations_closed',
  'in_progress',
  'completed',
  'cancelled',
  'deleted'
);

CREATE TYPE participation_status_behavior AS ENUM (
  'confirmed',
  'tentative',
  'declined',
  'custom'
);

CREATE TYPE confirmation_state AS ENUM (
  'confirmed',
  'requires_reconfirmation'
);

CREATE TYPE outbox_message_status AS ENUM (
  'pending',
  'claimed',
  'delivered',
  'failed'
);

CREATE TYPE hub_panel_status AS ENUM (
  'unconfigured',
  'publishing',
  'active',
  'degraded',
  'missing',
  'permission_denied',
  'detached'
);

CREATE TYPE publish_occurrence_status AS ENUM (
  'pending',
  'sent',
  'adopted',
  'failed',
  'cancelled'
);

CREATE TABLE guild_activity_settings (
  guild_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  organizer_default_status_id UUID,
  waitlist_promotion_status_id UUID,
  max_active_per_creator INTEGER NOT NULL DEFAULT 4 CHECK (max_active_per_creator > 0),
  registration_default_closes_at_start BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL REFERENCES guild_activity_settings (guild_id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_other BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, key)
);

CREATE TABLE participation_status_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL REFERENCES guild_activity_settings (guild_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  occupies_slot BOOLEAN NOT NULL DEFAULT FALSE,
  behavior participation_status_behavior NOT NULL,
  selectable_by_member BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  seed_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, seed_key)
);

CREATE INDEX participation_status_defs_guild_idx
  ON participation_status_defs (guild_id, sort_order);

ALTER TABLE guild_activity_settings
  ADD CONSTRAINT guild_activity_settings_organizer_default_fk
  FOREIGN KEY (organizer_default_status_id) REFERENCES participation_status_defs (id);

ALTER TABLE guild_activity_settings
  ADD CONSTRAINT guild_activity_settings_waitlist_promotion_fk
  FOREIGN KEY (waitlist_promotion_status_id) REFERENCES participation_status_defs (id);

CREATE TABLE participant_field_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL REFERENCES guild_activity_settings (guild_id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, key)
);

CREATE TABLE activity_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  creator_subject_type TEXT NOT NULL CHECK (creator_subject_type IN ('discord', 'v2')),
  creator_discord_user_id TEXT,
  creator_v2_user_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (creator_discord_user_id IS NOT NULL) OR (creator_v2_user_id IS NOT NULL)
  )
);

CREATE INDEX activity_drafts_guild_creator_idx
  ON activity_drafts (guild_id, creator_discord_user_id);

CREATE INDEX activity_drafts_expires_idx ON activity_drafts (expires_at);

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  type_id UUID REFERENCES activity_types (id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  status activity_status NOT NULL DEFAULT 'published',
  enrollment_open BOOLEAN NOT NULL DEFAULT TRUE,
  participant_limit INTEGER CHECK (participant_limit IS NULL OR participant_limit > 0),
  organizer_discord_user_id TEXT,
  organizer_v2_user_id TEXT,
  co_organizer_discord_user_id TEXT,
  co_organizer_v2_user_id TEXT,
  publication_channel_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  location_text TEXT,
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  scheduled_finish_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (organizer_discord_user_id IS NOT NULL) OR (organizer_v2_user_id IS NOT NULL)
  ),
  CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE INDEX activities_guild_status_idx ON activities (guild_id, status);
CREATE INDEX activities_organizer_discord_idx
  ON activities (guild_id, organizer_discord_user_id, status);
CREATE INDEX activities_scheduled_finish_idx ON activities (scheduled_finish_at, status);

CREATE TABLE participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  discord_user_id TEXT,
  v2_user_id TEXT,
  status_def_id UUID NOT NULL REFERENCES participation_status_defs (id),
  confirmation_state confirmation_state NOT NULL DEFAULT 'confirmed',
  reconfirm_deadline TIMESTAMPTZ,
  waitlist_position INTEGER,
  resigned_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  remove_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((discord_user_id IS NOT NULL) OR (v2_user_id IS NOT NULL))
);

CREATE UNIQUE INDEX participations_activity_discord_uidx
  ON participations (activity_id, discord_user_id)
  WHERE discord_user_id IS NOT NULL AND resigned_at IS NULL AND removed_at IS NULL;

CREATE UNIQUE INDEX participations_activity_v2_uidx
  ON participations (activity_id, v2_user_id)
  WHERE v2_user_id IS NOT NULL AND resigned_at IS NULL AND removed_at IS NULL;

CREATE UNIQUE INDEX participations_waitlist_position_uidx
  ON participations (activity_id, waitlist_position)
  WHERE waitlist_position IS NOT NULL AND resigned_at IS NULL AND removed_at IS NULL;

CREATE INDEX participations_activity_idx ON participations (activity_id);

CREATE TABLE participation_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id UUID NOT NULL REFERENCES participations (id) ON DELETE CASCADE,
  field_def_id UUID NOT NULL REFERENCES participant_field_defs (id),
  value_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participation_id, field_def_id)
);

CREATE TABLE activity_hub_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  panel_type TEXT NOT NULL DEFAULT 'hub',
  payload_version INTEGER NOT NULL DEFAULT 1,
  status hub_panel_status NOT NULL DEFAULT 'unconfigured',
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, discord_guild_id, panel_type)
);

CREATE TABLE panel_publish_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES activity_hub_panels (id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  nonce VARCHAR(25) NOT NULL,
  payload_version INTEGER NOT NULL,
  desired_channel_id TEXT NOT NULL,
  correlation_id TEXT,
  status publish_occurrence_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (panel_id, operation_id)
);

CREATE INDEX panel_publish_occurrences_panel_idx
  ON panel_publish_occurrences (panel_id, created_at DESC);

CREATE TABLE activity_projections (
  activity_id UUID PRIMARY KEY REFERENCES activities (id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  payload_version INTEGER NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  claim_owner TEXT,
  claim_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status outbox_message_status NOT NULL DEFAULT 'pending'
);

CREATE INDEX outbox_messages_claim_idx
  ON outbox_messages (status, available_at)
  WHERE status IN ('pending', 'claimed');

CREATE TABLE idempotency_records (
  scope TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, actor_key, operation, idempotency_key)
);

CREATE TABLE activity_audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT,
  activity_id UUID,
  actor_discord_user_id TEXT,
  actor_v2_user_id TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_audit_entries_activity_idx
  ON activity_audit_entries (activity_id, created_at DESC);

CREATE TABLE notification_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  recipient_discord_user_id TEXT,
  recipient_v2_user_id TEXT,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notification_inbox_recipient_discord_idx
  ON notification_inbox_items (recipient_discord_user_id, created_at DESC)
  WHERE recipient_discord_user_id IS NOT NULL;
