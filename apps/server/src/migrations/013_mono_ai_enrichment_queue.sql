CREATE TABLE IF NOT EXISTS mono_ai_enrichment_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  mono_tx_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mono_ai_enrichment_queue_tx_fk
    FOREIGN KEY (user_id, mono_tx_id)
    REFERENCES mono_transaction (user_id, mono_tx_id)
    ON DELETE CASCADE,
  CONSTRAINT mono_ai_enrichment_queue_unique_tx UNIQUE (user_id, mono_tx_id)
);

CREATE INDEX IF NOT EXISTS mono_ai_enrichment_queue_ready_idx
  ON mono_ai_enrichment_queue (available_at, id)
  WHERE status IN ('pending', 'failed');

COMMENT ON TABLE mono_ai_enrichment_queue IS
  'Server-owned outbox for n8n AI enrichment of Monobank transactions.';
