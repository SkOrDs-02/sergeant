-- 032: closure for backend tech-debt PR D — pin query-plan expectations to the
-- objects that survived migrations 002–024 via `COMMENT ON`.
--
-- ─── Why a docs-only migration ───────────────────────────────────────────────
--
-- `docs/tech-debt/backend.md` (§ Roadmap → PR D) carries three asks:
--
--   1. "EXPLAIN ANALYZE — треба додати inline-коментарі до міграцій для
--      важких запитів."
--   2. "Consistency constraints" — `request_count > 0`, `version >= 1`,
--      `endpoint length cap`, FK CASCADE.
--   3. "`idx_push_subscriptions_user_id` — перевірити, що вже існує."
--
-- All three are already enforced in code by previous migrations:
--
--   * 002 — `ai_usage_daily.request_count > 0` inline CHECK +
--           `idx_ai_usage_daily_day` для purge.
--   * 003 — `push_subscriptions.user_id REFERENCES "user"(id) ON DELETE
--           CASCADE`.
--   * 005 — `module_data.version > 0` (re-stated stronger as `>= 1` у 016),
--           `push_subs_endpoint_https`, `push_subs_keys_nonempty`,
--           `ai_usage_daily_bucket_format`, partial-index
--           `idx_push_subs_user_active` (drops the original
--           `idx_push_subs_user` from 003 і замінює на partial — тому
--           "idx_push_subscriptions_user_id" з backend.md задовольняється
--           саме цим partial-індексом, не окремим обʼєктом).
--   * 016 — `module_data_version_positive` (NOT VALID + VALIDATE дрилл),
--           `push_subscriptions_endpoint_max_length`, expected-plan коментарі
--           для патернів A–D у синку та push.
--   * 024 — `module_data_module_check`, partial-index `mono_transaction_active_idx`,
--           `deleted_at` колонки на чотирьох high-volume таблицях.
--
-- Цей файл нічого нового не додає у структуру схеми. Він прикручує
-- `COMMENT ON` до тих обʼєктів, що вже існують, щоб:
--   а) `psql \d+ <table>` / `\di+ <index>` дав фактичний query-plan
--      contract без необхідності лазити у git history;
--   б) інспектор у проді (DBA / on-call) міг швидко перевірити, що
--      гаряча таблиця досі задовольняє очікувані вимоги PR D без
--      повторного `EXPLAIN ANALYZE`-у;
--   в) майбутній рев'юер міграцій бачив одразу, який рядок у
--      backend.md PR D закриває цей чи той об'єкт.
--
-- Ідемпотентність. `COMMENT ON` у Postgres завжди idempotent:
-- перезаписує існуючий коментар без `IF NOT EXISTS` гімнастики.
-- Re-run міграції — no-op.
--
-- Інваріант: цей файл повинен оновлюватись синхронно з PR D-секцією
-- `docs/tech-debt/backend.md`. Якщо коментар нижче розходиться з тим,
-- що там написано — оновлюємо ОБИДВА місця в одному PR.
--
-- ─── 1. ai_usage_daily — purge plan ─────────────────────────────────────────
--
-- Гарячий read-path: `apps/server/src/modules/chat/aiQuota.ts:338` (UPSERT
-- з ON CONFLICT (subject_key, usage_day, bucket) — після 004 PK
-- розширений на `bucket`). Гарячий cleanup-path: retention-cron, що
-- DELETE-ає рядки старіше за 30 днів. До 004 PK-сканування покривало
-- обидва патерни; після 004 — UPSERT досі через PK, але DELETE
-- спирається саме на `idx_ai_usage_daily_day` (single-column на
-- `usage_day`), бо PK першою колонкою має `subject_key`.
--
-- Очікуваний план для DELETE WHERE usage_day < NOW() - INTERVAL '30 days':
--   Bitmap Heap Scan on ai_usage_daily
--     Recheck Cond: (usage_day < (now() - '30 days'::interval))
--     ->  Bitmap Index Scan on idx_ai_usage_daily_day
--           Index Cond: (usage_day < (now() - '30 days'::interval))
--
-- На реалістичному обсязі (<10k активних рядків × ~5 buckets) seq-scan
-- може виявитись дешевшим — Postgres сам обере. CHECK `request_count > 0`
-- ловить очевидні bug-и (`+0` increment, race-condition rollback, що
-- залишив рядок з 0).

COMMENT ON COLUMN ai_usage_daily.request_count IS
  'AI request counter per (subject_key, usage_day, bucket). Inline CHECK (request_count > 0) у 002 захищає від race-condition rollback-у та bug-ів атомарного UPSERT-а у aiQuota.ts. Покриває backend.md → PR D → "Consistency constraints → request_count > 0".';

COMMENT ON INDEX idx_ai_usage_daily_day IS
  'Purge index. Гарячий cleanup-path — DELETE WHERE usage_day < NOW() - 30 days. EXPLAIN ANALYZE: Bitmap Index Scan on idx_ai_usage_daily_day; на <10k рядків Postgres може обрати seq-scan — обидва плани прийнятні. Покриває backend.md → PR D → "EXPLAIN ANALYZE → ai_usage_daily purge".';

-- ─── 2. push_subscriptions — broadcast plan ────────────────────────────────
--
-- Гарячий read-path: `apps/server/src/push/send.ts:78` —
--   SELECT … FROM push_subscriptions WHERE user_id = $1
-- (після 005 неявно `AND deleted_at IS NULL` у consumer-коді,
-- soft-delete'нуті рядки в індекс не потрапляють).
--
-- Очікуваний план:
--   Index Scan using idx_push_subs_user_active on push_subscriptions
--     Index Cond: (user_id = $1)
--     (filter `deleted_at IS NULL` зашитий у partial — Rows Removed by
--      Filter = 0)
--
-- backend.md PR D просить перевірити "idx_push_subscriptions_user_id".
-- Цей requirement задовольняється `idx_push_subs_user_active` (partial
-- form), що замінив `idx_push_subs_user` у міграції 005. Окремий
-- `idx_push_subscriptions_user_id` без `WHERE deleted_at IS NULL`
-- створювати НЕ потрібно — він би дублював partial і додав bloat від
-- soft-deleted рядків.

COMMENT ON INDEX idx_push_subs_user_active IS
  'Broadcast index for sendPush(). Замінив `idx_push_subs_user` (003) у міграції 005, додавши partial-фільтр WHERE deleted_at IS NULL. Закриває backend.md → PR D → "verify idx_push_subscriptions_user_id" — partial form є канонічним обʼєктом цього requirement-у.';

-- ─── 3. push_subscriptions FK CASCADE — user-delete plan ───────────────────
--
-- Reqirement з backend.md PR D § Consistency constraints, останній
-- рядок: `push_subscriptions.user_id → user.id ON DELETE CASCADE`.
-- Constraint існує з міграції 003 (line 65), `pg_constraint.conname`
-- автогенерований Postgres-ом як `push_subscriptions_user_id_fkey`.
--
-- При user-delete планувальник пройде по кожному дочірньому table-у
-- через його user_id-індекс — ми спираємось на:
--   * `idx_module_data_user`           (003)
--   * `idx_push_subs_user_active`      (005, partial)
--   * `idx_push_devices_user_active`   (006, partial)
--   * `mono_transaction_active_idx`    (024, partial)
-- — щоб уникнути seq-scan-у на cascade evaluation. CHECK-и не
-- виконуються при DELETE, тому doc-comment нижче чисто-навігаційний.

COMMENT ON CONSTRAINT push_subscriptions_user_id_fkey ON push_subscriptions IS
  'FK push_subscriptions.user_id → "user"(id) ON DELETE CASCADE — додано у 003. Cascade-traversal спирається на idx_push_subs_user_active (005, partial). Покриває backend.md → PR D → "Consistency constraints → push_subscriptions FK CASCADE".';

-- ─── 4. module_data upsert plan — повторно зафіксовано тут ─────────────────
--
-- Хоча 016 уже має inline-коментар з ASCII-планом для патерну A
-- (`module_data` upsert на ON CONFLICT (user_id, module)), `\d+
-- module_data` у psql цей коментар не показує — він видимий лише через
-- `git log -p apps/server/src/migrations/016_*.sql`. Прикручуємо
-- COMMENT ON TABLE щоб DBA / on-call побачили expected-plan одразу.

COMMENT ON TABLE module_data IS
  'Sync state per (user_id, module). Hot upsert — INSERT … ON CONFLICT (user_id, module) DO UPDATE — план: Insert + Conflict Resolution UPDATE через arbiter idx module_data_user_id_module_key (PK). LWW guard `WHERE module_data.client_updated_at <= $4` робить старі push-и no-op. CHECK module_data_version_positive (016) + module_data_module_check (024) тримають інваріанти.';
