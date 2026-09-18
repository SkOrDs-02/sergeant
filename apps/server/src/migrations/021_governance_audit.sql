-- 020: Governance audit log (n8n WF-93 / hard-rules compliance auditor).
--
-- Зберігає порушення Hard Rules з `docs/governance/hard-rules.json`,
-- виявлені post-merge або у CI. Записи вставляє WF-93 через
-- `/api/internal/governance/audit`.

CREATE TABLE IF NOT EXISTS hard_rules_violations (
  id BIGSERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL,
  rule_title TEXT,
  severity TEXT NOT NULL DEFAULT 'blocker',
  pr_number INTEGER,
  commit_sha TEXT,
  file_path TEXT,
  line_number INTEGER,
  message TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hard_rules_violations_severity_check
    CHECK (severity IN ('blocker', 'major', 'minor', 'info'))
);

CREATE INDEX IF NOT EXISTS hard_rules_violations_detected_idx
  ON hard_rules_violations (detected_at DESC);

CREATE INDEX IF NOT EXISTS hard_rules_violations_unresolved_idx
  ON hard_rules_violations (detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS hard_rules_violations_rule_idx
  ON hard_rules_violations (rule_id, detected_at DESC);

COMMENT ON TABLE hard_rules_violations IS
  'Порушення Hard Rules з docs/governance/hard-rules.json (WF-93).';
