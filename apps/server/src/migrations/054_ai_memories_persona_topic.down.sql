-- Idempotent rollback for `054_ai_memories_persona_topic.sql`.
--
-- Drop order — index перед колонками (інакше Postgres відмовиться:
-- залежна колонка). IF EXISTS усюди — щоб повторний прогін не падав.
--
-- УВАГА: персона/topic-дані будуть втрачені. Для rollback з production-у
-- спочатку зробіть pg_dump cofounder-rows; rollback з порожнього схема —
-- безпечний. Це консистентно з іншими `*.down.sql` у репо.

DROP INDEX IF EXISTS ai_memories_persona_topic_idx;

ALTER TABLE ai_memories
  DROP COLUMN IF EXISTS topic;

ALTER TABLE ai_memories
  DROP COLUMN IF EXISTS persona;
