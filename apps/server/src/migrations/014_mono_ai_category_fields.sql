ALTER TABLE mono_transaction
  ADD COLUMN IF NOT EXISTS ai_category_slug TEXT,
  ADD COLUMN IF NOT EXISTS ai_category_confidence DOUBLE PRECISION
    CHECK (ai_category_confidence IS NULL OR (ai_category_confidence >= 0 AND ai_category_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS mono_transaction_ai_category_idx
  ON mono_transaction (ai_category_slug)
  WHERE ai_category_slug IS NOT NULL;

COMMENT ON COLUMN mono_transaction.ai_category_slug IS
  'AI-proposed category from internal/n8n enrichment. Does not override user-owned category_slug.';
COMMENT ON COLUMN mono_transaction.ai_category_confidence IS
  'Confidence score for ai_category_slug in the range 0..1.';
COMMENT ON COLUMN mono_transaction.ai_categorized_at IS
  'Timestamp when AI categorization last completed.';
