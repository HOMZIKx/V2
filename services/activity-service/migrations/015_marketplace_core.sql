-- Marketplace / Handel (Stage 7) — domain offers + watches.

CREATE TABLE IF NOT EXISTS marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, key)
);

CREATE TABLE IF NOT EXISTS marketplace_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  owner_discord_user_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  category_key TEXT NOT NULL,
  item_label TEXT NOT NULL,
  price_amount NUMERIC(18, 2),
  budget_amount NUMERIC(18, 2),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'matched', 'fulfilled', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_offers_search_idx
  ON marketplace_offers (guild_id, side, category_key, status, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  recipient_discord_user_id TEXT NOT NULL,
  side TEXT CHECK (side IN ('BUY', 'SELL')),
  category_key TEXT,
  item_query TEXT,
  max_price NUMERIC(18, 2),
  min_budget NUMERIC(18, 2),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_watches_active_idx
  ON marketplace_watches (guild_id, category_key)
  WHERE cancelled_at IS NULL;
