-- Reservations Core (Stage 6) — resource / CH / spot lifecycle.

CREATE TABLE IF NOT EXISTS reservation_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  resource_kind TEXT NOT NULL DEFAULT 'CH',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, key)
);

CREATE TABLE IF NOT EXISTS reservation_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES reservation_resources (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  resource_id UUID NOT NULL REFERENCES reservation_resources (id),
  spot_id UUID NOT NULL REFERENCES reservation_spots (id),
  owner_discord_user_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'completed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservations_time_ok CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS reservations_spot_time_idx
  ON reservations (spot_id, starts_at, ends_at)
  WHERE status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS reservations_owner_idx
  ON reservations (owner_discord_user_id, starts_at DESC);
