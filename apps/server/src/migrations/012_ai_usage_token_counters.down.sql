ALTER TABLE ai_usage_daily
  DROP COLUMN IF EXISTS total_tokens,
  DROP COLUMN IF EXISTS output_tokens,
  DROP COLUMN IF EXISTS input_tokens;
