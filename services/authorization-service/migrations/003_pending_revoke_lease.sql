-- P3 final closure: durable revoke leases, backoff, terminal failure.

ALTER TABLE pending_session_revoke
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 25;

ALTER TABLE pending_session_revoke
  DROP CONSTRAINT IF EXISTS pending_session_revoke_status_check;

UPDATE pending_session_revoke
SET status = 'failed_terminal'
WHERE status = 'failed';

ALTER TABLE pending_session_revoke
  ADD CONSTRAINT pending_session_revoke_status_check
  CHECK (status IN ('pending', 'delivered', 'failed_terminal'));

CREATE INDEX IF NOT EXISTS pending_session_revoke_claim_idx
  ON pending_session_revoke (status, next_attempt_at ASC, created_at ASC)
  WHERE status = 'pending';
