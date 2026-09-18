-- Денні ліміти викликів AI (Anthropic): subject_key = u:<userId> або ip:<address>
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  subject_key TEXT NOT NULL,
  usage_day DATE NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (subject_key, usage_day)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_day ON ai_usage_daily (usage_day);
