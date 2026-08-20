-- P4.5: participation scope for SEPARATE mode (scope_guild_id).
-- SHARED keeps scope_guild_id NULL.

ALTER TABLE participations
  ADD COLUMN IF NOT EXISTS scope_guild_id TEXT;

-- Restrict SHARED uniqueness to scope_guild_id IS NULL so SEPARATE pools can coexist.
DROP INDEX IF EXISTS participations_waitlist_position_uidx;
DROP INDEX IF EXISTS participations_activity_discord_uidx;
DROP INDEX IF EXISTS participations_activity_v2_uidx;

CREATE UNIQUE INDEX participations_shared_discord_uidx
  ON participations (activity_id, discord_user_id)
  WHERE scope_guild_id IS NULL
    AND discord_user_id IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

CREATE UNIQUE INDEX participations_shared_v2_uidx
  ON participations (activity_id, v2_user_id)
  WHERE scope_guild_id IS NULL
    AND v2_user_id IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

CREATE UNIQUE INDEX participations_shared_waitlist_uidx
  ON participations (activity_id, waitlist_position)
  WHERE scope_guild_id IS NULL
    AND waitlist_position IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

CREATE UNIQUE INDEX participations_sep_waitlist_uidx
  ON participations (activity_id, scope_guild_id, waitlist_position)
  WHERE scope_guild_id IS NOT NULL
    AND waitlist_position IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

-- Active user uniqueness for SEPARATE scopes (SHARED keeps existing activity-wide indexes).
CREATE UNIQUE INDEX participations_sep_discord_uidx
  ON participations (activity_id, scope_guild_id, discord_user_id)
  WHERE scope_guild_id IS NOT NULL
    AND discord_user_id IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

CREATE UNIQUE INDEX participations_sep_v2_uidx
  ON participations (activity_id, scope_guild_id, v2_user_id)
  WHERE scope_guild_id IS NOT NULL
    AND v2_user_id IS NOT NULL
    AND resigned_at IS NULL
    AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS participations_scope_guild_idx
  ON participations (activity_id, scope_guild_id)
  WHERE scope_guild_id IS NOT NULL;

COMMENT ON COLUMN participations.scope_guild_id IS
  'NULL=SHARED pool; set=SEPARATE pool for that guild';
