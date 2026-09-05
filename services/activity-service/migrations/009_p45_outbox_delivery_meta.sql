-- P4.5: optional outbox broker delivery metadata (additive).

ALTER TABLE outbox_messages
  ADD COLUMN IF NOT EXISTS transport TEXT NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS broker_message_id TEXT,
  ADD COLUMN IF NOT EXISTS broker_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broker_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outbox_messages_broker_message_uidx
  ON outbox_messages (broker_message_id)
  WHERE broker_message_id IS NOT NULL;

COMMENT ON COLUMN outbox_messages.transport IS
  'http | rabbitmq | dual — delivery path used or intended';
