-- 025: pgvector + AI memory store (foundation only — нічого не пише й не читає
-- до PR #N+1, що включає Memory ingestion + retrieval).
--
-- Це storage для семантичної пам'яті асистента: довільні текстові факти, які
-- AI має згадати на наступних чат-турнах (наприклад, "користувач витратив 1.2k
-- грн на каву цього тижня", "в неділю була тренування 4×8 присідань 80 кг",
-- summary тижневого digest-у). На відміну від Memory Bank (ADR-0021), яка
-- local-first і зберігає user-fact-strings ("я веганка"), цей store — серверний,
-- vector-indexований, і працює з episodic-memory (події, спостереження,
-- агреговані вікна).
--
-- Окрема система навмисно: Memory Bank optimized for soft-auth UX (anon
-- chats працюють без сервера) і має ~10–30 рядків per user. Episodic memory
-- — серверна, ~200–500 рядків/міс per active user, потребує semantic search.
--
-- ─── Ключові технічні рішення ────────────────────────────────────────────
--
-- 1. EXTENSION vector — pgvector ≥0.7 (Railway Postgres 16 з custom image
--    Railway `vector`-template; у local dev — `pgvector/pgvector:pg16`).
--    Обережно: extension namespace глобальний, тому ні в одному migration
--    раніше його не вмикаємо.
--
-- 2. HALFVEC(1024) — half-precision (16-bit) floats замість float32 (4 байти).
--    Економія −50% RAM для HNSW-індекса, recall-loss на embedding-задачах
--    практично нуль (pgvector docs § "Half-precision indexing"). Розмір 1024
--    обраний під Voyage `voyage-3.5-lite` (multilingual lite-tier, нативно
--    1024d). УВАГА: попередник `voyage-3-lite` ВИДАЄ ТІЛЬКИ 512d → несумісно
--    зі схемою. 1024d-сумісні моделі: `voyage-3.5-lite`, `voyage-3`,
--    `voyage-3.5`, `voyage-3-large`.
--
-- 3. PARTITION BY HASH (user_id) на 32 партиції — pre-filter по тенанту.
--    Без партиціонування HNSW-індекс — глобальний; topK-пошук для одного
--    юзера вертає topK кандидатів з усіх юзерів, потім фільтрується по
--    `user_id` post-hoc → recall провалюється. Партиціонування гарантує,
--    що кожна партиція має свій HNSW і запит до неї читає тільки рядки
--    обмеженого тенант-сабсету. 32 партиції — sweet-spot для 1k–32k
--    активних (за рекомендацією Postgres `2^N` де N≈log2(active_users/1k)).
--    Якщо переростимо — зробимо `MODULUS=128` міграцією окремо через
--    `CREATE TABLE ... PARTITION OF` + `pg_partman` без даунтайму.
--
-- 4. PRIMARY KEY (user_id, id) — partition key першим. Без цього
--    PARTITION BY HASH (user_id) не приймає композитного PK.
--
-- 5. EMBEDDING_PROVIDER + EMBEDDING_MODEL + EMBEDDING_VERSION — записуємо
--    у row, а не в config. Якщо колись мігруємо на новішу модель Voyage
--    або на Cohere — будемо знати, які row-и треба re-embed-ити (vector
--    spaces різні; змішування ламає HNSW recall). Без цього — або
--    re-embed-ити все, або terпіти нечитабельний пошук.
--
-- 6. ON DELETE CASCADE до `"user"(id)` — GDPR-вимога. При видаленні
--    акаунту через Better Auth (`auth.deleteUser` у `server/auth.ts`)
--    каскад відразу фізично purge-ить vector rows. Без додаткового
--    cleanup queue step.
--
-- 7. CONTENT TEXT — оригінальний текст memory зберігається поряд з
--    embedding-ом. Це окремо від `metadata` JSONB і потрібно для:
--      a) re-embedding-у при зміні моделі (treat content як SSOT);
--      b) human-debugging (в Grafana / pgAdmin зрозуміло, що саме у
--         row-у, не лише 1024-вимірний вектор);
--      c) повернення до моделі як `tool_result` під час retrieval.
--
-- 8. METADATA JSONB — довільні структуровані факти (date, amount,
--    category, mono_tx_id, ...). Не індексуємо JSONB — query завжди
--    проходить через embedding-similarity, а metadata — для post-filter
--    (`WHERE metadata->>'date' >= '...'`). Якщо колись потрібен буде
--    field-specific index (наприклад, по даті) — додамо partial GIN/BTREE
--    окремою міграцією.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_memories (
  id BIGSERIAL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN ('chat', 'finyk', 'fizruk', 'nutrition', 'routine', 'journal', 'digest')),
  source_ref TEXT,
  content TEXT NOT NULL,
  embedding HALFVEC(1024) NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
) PARTITION BY HASH (user_id);

-- 32 партиції. Список явний (не loop) — `pnpm lint:migrations` парсить
-- лише статичний SQL і `DO $$` рантайм-блок ховав би кількість партицій
-- від code-review.
CREATE TABLE IF NOT EXISTS ai_memories_p00 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 0);
CREATE TABLE IF NOT EXISTS ai_memories_p01 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 1);
CREATE TABLE IF NOT EXISTS ai_memories_p02 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 2);
CREATE TABLE IF NOT EXISTS ai_memories_p03 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 3);
CREATE TABLE IF NOT EXISTS ai_memories_p04 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 4);
CREATE TABLE IF NOT EXISTS ai_memories_p05 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 5);
CREATE TABLE IF NOT EXISTS ai_memories_p06 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 6);
CREATE TABLE IF NOT EXISTS ai_memories_p07 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 7);
CREATE TABLE IF NOT EXISTS ai_memories_p08 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 8);
CREATE TABLE IF NOT EXISTS ai_memories_p09 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 9);
CREATE TABLE IF NOT EXISTS ai_memories_p10 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 10);
CREATE TABLE IF NOT EXISTS ai_memories_p11 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 11);
CREATE TABLE IF NOT EXISTS ai_memories_p12 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 12);
CREATE TABLE IF NOT EXISTS ai_memories_p13 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 13);
CREATE TABLE IF NOT EXISTS ai_memories_p14 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 14);
CREATE TABLE IF NOT EXISTS ai_memories_p15 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 15);
CREATE TABLE IF NOT EXISTS ai_memories_p16 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 16);
CREATE TABLE IF NOT EXISTS ai_memories_p17 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 17);
CREATE TABLE IF NOT EXISTS ai_memories_p18 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 18);
CREATE TABLE IF NOT EXISTS ai_memories_p19 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 19);
CREATE TABLE IF NOT EXISTS ai_memories_p20 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 20);
CREATE TABLE IF NOT EXISTS ai_memories_p21 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 21);
CREATE TABLE IF NOT EXISTS ai_memories_p22 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 22);
CREATE TABLE IF NOT EXISTS ai_memories_p23 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 23);
CREATE TABLE IF NOT EXISTS ai_memories_p24 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 24);
CREATE TABLE IF NOT EXISTS ai_memories_p25 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 25);
CREATE TABLE IF NOT EXISTS ai_memories_p26 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 26);
CREATE TABLE IF NOT EXISTS ai_memories_p27 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 27);
CREATE TABLE IF NOT EXISTS ai_memories_p28 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 28);
CREATE TABLE IF NOT EXISTS ai_memories_p29 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 29);
CREATE TABLE IF NOT EXISTS ai_memories_p30 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 30);
CREATE TABLE IF NOT EXISTS ai_memories_p31 PARTITION OF ai_memories FOR VALUES WITH (MODULUS 32, REMAINDER 31);

-- HNSW index на parent — pgvector ≥0.7 каскадить його у кожну партицію.
-- m=16, ef_construction=64 — defaults Voyage / pgvector benchmark; recall@10
-- ≥ 0.95 на 1024-вимірних embeddings (див. ADR-0028).
--
-- halfvec_cosine_ops — cosine similarity на half-precision векторах.
-- Voyage embeddings нормалізовані, тому cosine ≡ dot product, але cosine
-- стійкіший до numerical drift при оновленнях (rebuild-у).
CREATE INDEX IF NOT EXISTS ai_memories_embedding_idx
  ON ai_memories
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Допоміжні B-tree індекси для post-filter після ANN-search:
-- 1) `(user_id, source, created_at DESC)` — список memory одного юзера
--    по конкретному сорсу в хронологічному порядку (UI debug, admin tools).
CREATE INDEX IF NOT EXISTS ai_memories_user_source_created_idx
  ON ai_memories (user_id, source, created_at DESC);

-- 2) `(user_id, source, source_ref)` partial — швидкий lookup "чи існує
--    memory для цієї мономtx/digest-week/etc". Partial — щоб не індексувати
--    тисячі NULL-ів від chat-source-ів без `source_ref`.
CREATE INDEX IF NOT EXISTS ai_memories_source_ref_idx
  ON ai_memories (user_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

COMMENT ON TABLE ai_memories IS
  'AI episodic memory store. Vector-indexed (pgvector HNSW), partitioned by hash(user_id) на 32 партиції. Окремо від Memory Bank (ADR-0021): Memory Bank — local-first user-facts, ai_memories — server-side episodic memory.';
COMMENT ON COLUMN ai_memories.embedding_provider IS
  'Vector provider tag (наприклад, ''voyage''). Дозволяє re-embed-ити row-и при зміні провайдера без втрати оригінального тексту.';
COMMENT ON COLUMN ai_memories.embedding_model IS
  'Конкретна модель (наприклад, ''voyage-3.5-lite''). Vector spaces різних моделей не сумісні — змішування ламає HNSW recall.';
COMMENT ON COLUMN ai_memories.embedding_version IS
  'Internal semver нашої embedding-схеми (наприклад, ''v1''). Бампимо при зміні prompt-template для embedding-у.';
COMMENT ON COLUMN ai_memories.source IS
  'Доменний source. CHECK constraint обмежує до set-у, що співпадає з ingestion-hooks у PR #N+1.';
COMMENT ON COLUMN ai_memories.source_ref IS
  'Зовнішній id з домена (mono_tx_id, digest week_key, journal entry id). NULL для chat-source-у.';
