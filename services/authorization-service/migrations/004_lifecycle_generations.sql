-- Durable Discord lifecycle generations for occurrence identity (P3 closure).
-- Authorization DB is the source of truth; gateway process memory is not.

ALTER TABLE discord_membership
  ADD COLUMN IF NOT EXISTS lifecycle_generation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE connected_guild
  ADD COLUMN IF NOT EXISTS availability_generation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_generation INTEGER NOT NULL DEFAULT 0;
