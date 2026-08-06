-- P3 Authorization foundation schema (single organization model).

CREATE TABLE IF NOT EXISTS organization (
  id UUID PRIMARY KEY,
  owner_discord_user_id TEXT,
  owner_v2_user_id TEXT,
  bootstrap_completed_at TIMESTAMPTZ,
  bootstrap_source_discord_user_id_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_owner_discord_when_bootstrapped CHECK (
    bootstrap_completed_at IS NULL
    OR (owner_discord_user_id IS NOT NULL AND bootstrap_source_discord_user_id_snapshot IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS connected_guild (
  discord_guild_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organization (id),
  status TEXT NOT NULL CHECK (status IN ('pending_sync', 'active', 'inactive_detached')),
  login_entitling BOOLEAN NOT NULL DEFAULT FALSE,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('fresh', 'stale', 'unavailable')),
  last_fresh_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connected_guild_org_idx ON connected_guild (organization_id);
CREATE INDEX IF NOT EXISTS connected_guild_entitling_idx ON connected_guild (login_entitling)
  WHERE login_entitling = TRUE AND status = 'active';

CREATE TABLE IF NOT EXISTS discord_role_snapshot (
  discord_guild_id TEXT NOT NULL REFERENCES connected_guild (discord_guild_id),
  discord_role_id TEXT NOT NULL,
  name_cache TEXT,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_guild_id, discord_role_id)
);

CREATE TABLE IF NOT EXISTS discord_membership (
  discord_guild_id TEXT NOT NULL REFERENCES connected_guild (discord_guild_id),
  discord_user_id TEXT NOT NULL,
  v2_user_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  last_synced_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'gateway',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_guild_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS discord_membership_v2_idx ON discord_membership (v2_user_id)
  WHERE v2_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS discord_membership_discord_user_idx ON discord_membership (discord_user_id);

CREATE TABLE IF NOT EXISTS discord_member_role (
  discord_guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  PRIMARY KEY (discord_guild_id, discord_user_id, discord_role_id),
  FOREIGN KEY (discord_guild_id, discord_user_id)
    REFERENCES discord_membership (discord_guild_id, discord_user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_identity_link (
  discord_user_id TEXT PRIMARY KEY,
  v2_user_id TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permission_definition (
  permission_id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_definition (
  group_id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_permission (
  group_id TEXT NOT NULL REFERENCES group_definition (group_id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permission_definition (permission_id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_id)
);

CREATE TABLE IF NOT EXISTS discord_role_mapping (
  id UUID PRIMARY KEY,
  discord_guild_id TEXT NOT NULL REFERENCES connected_guild (discord_guild_id) ON DELETE CASCADE,
  discord_role_id TEXT NOT NULL,
  group_id TEXT REFERENCES group_definition (group_id) ON DELETE CASCADE,
  permission_id TEXT REFERENCES permission_definition (permission_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT discord_role_mapping_target CHECK (
    (group_id IS NOT NULL AND permission_id IS NULL)
    OR (group_id IS NULL AND permission_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS discord_role_mapping_unique_group
  ON discord_role_mapping (discord_guild_id, discord_role_id, group_id)
  WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discord_role_mapping_unique_permission
  ON discord_role_mapping (discord_guild_id, discord_role_id, permission_id)
  WHERE permission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_grant (
  id UUID PRIMARY KEY,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  permission_id TEXT REFERENCES permission_definition (permission_id),
  group_id TEXT REFERENCES group_definition (group_id),
  discord_user_id TEXT,
  v2_user_id TEXT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'guild')),
  scope_guild_id TEXT,
  specificity TEXT NOT NULL CHECK (specificity IN ('user', 'guild', 'organization', 'group_default')),
  reason TEXT,
  created_by TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_grant_target CHECK (
    (permission_id IS NOT NULL AND group_id IS NULL)
    OR (permission_id IS NULL AND group_id IS NOT NULL)
  ),
  CONSTRAINT access_grant_subject CHECK (
    discord_user_id IS NOT NULL OR v2_user_id IS NOT NULL
  ),
  CONSTRAINT access_grant_scope_guild CHECK (
    (scope_type = 'organization' AND scope_guild_id IS NULL)
    OR (scope_type = 'guild' AND scope_guild_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS access_grant_subject_idx ON access_grant (v2_user_id, discord_user_id);
CREATE INDEX IF NOT EXISTS access_grant_expires_idx ON access_grant (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_block (
  id UUID PRIMARY KEY,
  discord_user_id TEXT,
  v2_user_id TEXT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'guild')),
  scope_guild_id TEXT,
  reason TEXT NOT NULL,
  created_by TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_block_subject CHECK (
    discord_user_id IS NOT NULL OR v2_user_id IS NOT NULL
  ),
  CONSTRAINT access_block_scope CHECK (
    (scope_type = 'global' AND scope_guild_id IS NULL)
    OR (scope_type = 'guild' AND scope_guild_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS access_block_subject_idx ON access_block (v2_user_id, discord_user_id);

CREATE TABLE IF NOT EXISTS processed_event (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  discord_guild_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_hash TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  actor TEXT,
  subject_v2_user_id TEXT,
  subject_discord_user_id TEXT,
  discord_guild_id TEXT,
  correlation_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_idx ON audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_correlation_idx ON audit_log (correlation_id);

INSERT INTO permission_definition (permission_id, description) VALUES
  ('permission.platform.login.www', 'Technical: WWW login entitlement'),
  ('permission.authorization.policy.read', 'Technical: read authorization policy'),
  ('permission.authorization.policy.manage.org', 'Technical: manage organization policy'),
  ('permission.authorization.policy.manage.guild', 'Technical: manage guild-scoped policy')
ON CONFLICT (permission_id) DO NOTHING;

INSERT INTO group_definition (group_id, description) VALUES
  ('group.foundation.test.member', 'Technical test member group'),
  ('group.foundation.test.local_mod', 'Technical test local moderator group')
ON CONFLICT (group_id) DO NOTHING;

INSERT INTO group_permission (group_id, permission_id) VALUES
  ('group.foundation.test.member', 'permission.platform.login.www'),
  ('group.foundation.test.local_mod', 'permission.authorization.policy.read'),
  ('group.foundation.test.local_mod', 'permission.authorization.policy.manage.guild')
ON CONFLICT DO NOTHING;
