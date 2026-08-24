BEGIN;

-- Activity browse / my-activities ordering by start_at within guild.
CREATE INDEX IF NOT EXISTS activities_guild_start_active_idx
  ON activities (guild_id, start_at)
  WHERE status <> 'deleted';

-- My-activities participant lookup by discord user (active participations only).
CREATE INDEX IF NOT EXISTS participations_discord_active_idx
  ON participations (discord_user_id, activity_id)
  WHERE resigned_at IS NULL AND removed_at IS NULL;

-- LFG intent matching: org-scoped active intent scan.
CREATE INDEX IF NOT EXISTS lfg_intents_active_org_idx
  ON lfg_intents (guild_id, organization_id, activity_type_key, expires_at)
  WHERE cancelled_at IS NULL AND fulfilled_at IS NULL AND paused_at IS NULL;

-- Outbox: reclaim expired leases without scanning pending available_at index.
CREATE INDEX IF NOT EXISTS outbox_messages_claim_expired_idx
  ON outbox_messages (claim_expires_at)
  WHERE status = 'claimed';

COMMIT;
