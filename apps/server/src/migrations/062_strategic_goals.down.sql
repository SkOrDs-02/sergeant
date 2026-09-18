-- Down migration: strategic_goals
-- PR-34 rollback. Drop strategic mode datalayer + indexes + trigger + helper fn.

DROP TRIGGER IF EXISTS strategic_goals_updated_at_trigger ON strategic_goals;
DROP FUNCTION IF EXISTS strategic_goals_set_updated_at();
DROP INDEX IF EXISTS strategic_goals_founder_week_idx;
DROP INDEX IF EXISTS strategic_goals_persona_week_idx;
DROP TABLE IF EXISTS strategic_goals;
