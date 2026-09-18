DROP INDEX IF EXISTS mono_transaction_ai_category_idx;

ALTER TABLE mono_transaction
  DROP COLUMN IF EXISTS ai_categorized_at,
  DROP COLUMN IF EXISTS ai_category_confidence,
  DROP COLUMN IF EXISTS ai_category_slug;
