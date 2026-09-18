-- 054: ai_memories persona + topic — multi-persona memory isolation (PR-B / Phase 0.5).
--
-- Контекст (план: `docs/planning/openclaw-migration-plan.md` § Memory schema
-- extension, Locked decision #9): OpenClaw plugin рухається до 10 персон,
-- кожна з власним isolated namespace в memory. До цієї міграції весь
-- cofounder-namespace йшов через `source='cofounder'` (додано в 028). Тепер
-- розширюємо: `persona` — котра з 10 ролей пише/читає, `topic` — вільне
-- поле для project-scoped пам'яті (наприклад `tacmed-portal`, `cross`).
--
-- ─── Семантика ─────────────────────────────────────────────────────────
--
-- Read filter (на app-рівні, у `recall_memory` tool):
--   * cofounder (superuser) → бачить ВСЕ під своїм founder_user_id (включно
--     з рядками інших персон та усіх topic).
--   * Інша персона `<P>` → бачить тільки `WHERE persona = <P> OR topic =
--     'shared'`. Це гарантує, що eng-persona не бачить fin-conversation,
--     але обоє бачать "shared" notes (наприклад "Q3 OKR-и команди").
--   * Source залишається фільтром першого рівня: `WHERE source IN
--     ('cofounder', ...)` для backward compat. Persona/topic — фільтр
--     другого рівня поверх source.
--
-- Write semantics (у `record_decision` + memory-write tools):
--   * persona = поточна викликаюча роль (з context-у плагіна).
--   * topic = inferred (з повідомлення founder-а) або 'cross' / NULL якщо
--     невідомо. Allowlist topics обговорюється у Phase 2.
--
-- ─── Чому єдина міграція ────────────────────────────────────────────────
--
-- Обидві колонки додаються одночасно — це разове розширення сторінки
-- ai_memories rows перед стартом multi-persona writes. Розділяти на дві
-- міграції безглуздо: жодна з колонок не використовується до того, як
-- plugin Phase 1 шиппиться (code-path під ними неактивний). Hard Rule #4
-- (sequential migrations, two-phase for DROP) тут не застосовується — це
-- ADD COLUMN, не DROP.
--
-- ─── Дефолти ────────────────────────────────────────────────────────────
--
-- `persona TEXT NOT NULL DEFAULT 'cofounder'`: усі історичні рядки
-- автоматично mapping до cofounder-у — це історично коректно, бо до 028
-- існували лише source-namespace-и (chat / finyk / journal etc.), а
-- source='cofounder' з 028 — теж cofounder-persona. Дефолт також гарантує,
-- що не-OpenClaw call-sites (Memory ingestion з web/mobile у Phase 1) не
-- зломаються — вони не передають persona, дефолт працює.
--
-- `topic TEXT` (nullable): вільне поле; NULL означає "не каталогізовано"
-- (cross-cutting). Не enforce-имо allowlist через CHECK, бо topics
-- розширюються динамічно (Phase 2 обговорить mapping). Натомість
-- `recall_memory` filter дивиться на `topic = 'shared'` як на opt-in
-- shared-pool маркер.
--
-- ─── Партиційний caveat ─────────────────────────────────────────────────
--
-- `ai_memories` партиціонована BY HASH (user_id) на 32 партиції (025).
-- ALTER TABLE на parent каскадиться у партиції автоматично (Postgres ≥11).
-- Тому ми ALTER лише parent-таблицю — все 32 партиції автоматично
-- отримують нову колонку.

ALTER TABLE ai_memories
  ADD COLUMN persona TEXT NOT NULL DEFAULT 'cofounder';

ALTER TABLE ai_memories
  ADD COLUMN topic TEXT;

COMMENT ON COLUMN ai_memories.persona IS
  'OpenClaw persona, що писала row (cofounder / eng / devops / pm / growth / seo / content / data / cs / finance). Дефолт ''cofounder'' для backward compat. ADR-0033, plan § Memory schema extension.';

COMMENT ON COLUMN ai_memories.topic IS
  'Optional topic-scope (наприклад ''tacmed-portal'', ''cross'', ''shared''). Allowlist на app-рівні. Spec у `docs/planning/openclaw-migration-plan.md`.';

-- Persona/topic-aware recall index. Найчастіший запит у Phase 2:
--   SELECT ... FROM ai_memories
--    WHERE user_id = $1 AND source = 'cofounder'
--      AND (persona = $2 OR topic = 'shared')
--    ORDER BY embedding <=> $vec
--    LIMIT $k;
-- HNSW vector index уже стоїть на parent-таблиці (025); тут окремий
-- B-tree pre-filter index на (user_id, persona) — це partition-local через
-- partition-pruning, тож дешево. WHERE-clause обмежує index до cofounder-
-- source-у — там 99% запитів живуть, інші source-и не вживають persona.
CREATE INDEX IF NOT EXISTS ai_memories_persona_topic_idx
  ON ai_memories (user_id, persona, created_at DESC)
  WHERE source = 'cofounder';

COMMENT ON INDEX ai_memories_persona_topic_idx IS
  'Persona-scoped pre-filter для cofounder-source recall. Vector ANN живе на HNSW (025) — цей index сужує candidate set до per-persona / per-user перед vector-rank.';
