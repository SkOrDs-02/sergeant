ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0 CHECK (total_tokens >= 0);

COMMENT ON COLUMN ai_usage_daily.input_tokens IS
  'Prompt/input tokens reported by machine-to-machine AI callers such as n8n.';
COMMENT ON COLUMN ai_usage_daily.output_tokens IS
  'Completion/output tokens reported by machine-to-machine AI callers such as n8n.';
COMMENT ON COLUMN ai_usage_daily.total_tokens IS
  'Total tokens reported by machine-to-machine AI callers such as n8n.';
