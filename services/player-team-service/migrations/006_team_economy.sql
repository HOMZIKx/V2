-- Team economy: shared loot, ownership attribution, prices, costs and split leftovers.

CREATE TABLE IF NOT EXISTS player_team_economy_items (
  id              TEXT PRIMARY KEY,
  canonical_name  TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Pozostałe',
  image_url       TEXT,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptei_canonical_name_ci
  ON player_team_economy_items (LOWER(canonical_name));

CREATE TABLE IF NOT EXISTS player_team_economy_item_aliases (
  item_id         TEXT NOT NULL REFERENCES player_team_economy_items(id) ON DELETE CASCADE,
  alias           TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, alias)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pteia_alias_ci
  ON player_team_economy_item_aliases (LOWER(alias));

CREATE TABLE IF NOT EXISTS player_team_economy_prices (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES player_team_economy_items(id) ON DELETE CASCADE,
  workspace_id    TEXT NOT NULL,
  unit_price      NUMERIC(24,4) NOT NULL CHECK (unit_price >= 0),
  currency        TEXT NOT NULL CHECK (currency IN ('yang','won','gem')),
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ptep_item_workspace_date
  ON player_team_economy_prices (item_id, workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_team_drop_sessions (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL,
  source                TEXT NOT NULL,
  occurred_at           TIMESTAMPTZ NOT NULL,
  notes                 TEXT,
  screenshot_ref        TEXT,
  our_share_basis_points INTEGER NOT NULL DEFAULT 10000 CHECK (our_share_basis_points BETWEEN 0 AND 10000),
  pile_count            INTEGER NOT NULL DEFAULT 1 CHECK (pile_count BETWEEN 1 AND 100),
  split_mode            TEXT NOT NULL DEFAULT 'max_equal' CHECK (split_mode IN ('max_equal','strict_equal')),
  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ptds_workspace_date
  ON player_team_drop_sessions (workspace_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS player_team_drop_participants (
  session_id      TEXT NOT NULL REFERENCES player_team_drop_sessions(id) ON DELETE CASCADE,
  participant_id  TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  is_team_member  BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (session_id, participant_id)
);

CREATE TABLE IF NOT EXISTS player_team_drop_items (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES player_team_drop_sessions(id) ON DELETE CASCADE,
  item_id         TEXT REFERENCES player_team_economy_items(id) ON DELETE SET NULL,
  display_name    TEXT NOT NULL,
  total_quantity  INTEGER NOT NULL CHECK (total_quantity > 0),
  our_quantity    INTEGER NOT NULL CHECK (our_quantity >= 0 AND our_quantity <= total_quantity),
  unit_price      NUMERIC(24,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency        TEXT NOT NULL DEFAULT 'yang' CHECK (currency IN ('yang','won','gem')),
  ai_confidence   NUMERIC(5,4) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ptdi_session ON player_team_drop_items (session_id);

CREATE TABLE IF NOT EXISTS player_team_drop_leftovers (
  drop_item_id    TEXT PRIMARY KEY REFERENCES player_team_drop_items(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL CHECK (quantity >= 0),
  status          TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored','sold','distributed','consumed','moved')),
  updated_by      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_team_expenses (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  drop_session_id TEXT REFERENCES player_team_drop_sessions(id) ON DELETE SET NULL,
  label           TEXT NOT NULL,
  expense_type    TEXT NOT NULL CHECK (expense_type IN ('item','yang','gem','other')),
  quantity        NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      NUMERIC(24,4) NOT NULL CHECK (unit_price >= 0),
  currency        TEXT NOT NULL CHECK (currency IN ('yang','won','gem')),
  our_share_basis_points INTEGER NOT NULL DEFAULT 10000 CHECK (our_share_basis_points BETWEEN 0 AND 10000),
  occurred_at     TIMESTAMPTZ NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pte_workspace_date
  ON player_team_expenses (workspace_id, occurred_at DESC);
