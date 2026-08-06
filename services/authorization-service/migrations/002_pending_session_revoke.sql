-- P3 Authorization security remediation: durable pending session revokes.

CREATE TABLE IF NOT EXISTS pending_session_revoke (
  id UUID PRIMARY KEY,
  v2_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  source_event_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pending_session_revoke_pending_idx
  ON pending_session_revoke (status, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS pending_session_revoke_user_idx
  ON pending_session_revoke (v2_user_id);

-- Enrich audit rows with authenticated client identity when present.
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS actor_client_id TEXT;

CREATE INDEX IF NOT EXISTS audit_log_actor_client_idx
  ON audit_log (actor_client_id)
  WHERE actor_client_id IS NOT NULL;
