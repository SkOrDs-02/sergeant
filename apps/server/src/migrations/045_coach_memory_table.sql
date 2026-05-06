-- 045: Dedicated `coach_memory` table — odlucz coach state від `module_data`
-- legacy blob-таблиці.
--
-- Stage 7 (Cleanup) prerequisite з `docs/planning/storage-roadmap.md`. Перед
-- тим як drop-нути column `module_data` (PR #051 у roadmap-у), треба
-- перенести ще-активних користувачів `module_data`: на момент 2026-05-06
-- це лише `coach` (records-у з module='coach'). `profile` теж лежить у
-- `module_data` але вже не має server-side reader-ів після ADR-0047 (v1
-- cloudSync = 410 Gone) і тому списується разом із drop-ом column-у.
--
-- ─── Schema ────────────────────────────────────────────────────────────
--
-- `coach_memory` — простий per-user JSONB store. На відміну від
-- `module_data` тут немає `module` колонки (це single-purpose table) і
-- немає `id SERIAL`-у (PK = user_id, бо завжди одна пам'ять на юзера).
--
-- Поля:
--   user_id (TEXT PK) — Better-Auth user id, FK на `"user"`.
--   data (JSONB)     — структура з `apps/server/src/modules/chat/coach.ts`
--                       (`weeklyDigests[]`, `lastInsightDate`, `lastInsightText`).
--   version (INT)    — оптимістичний counter, інкрементується на кожному
--                       saveMemory-у; зараз не використовується для
--                       conflict-resolution-у (single-process write-er),
--                       але лишається для майбутньої dual-write-protection-и.
--   client_updated_at, server_updated_at — таймстемпи NOT NULL із
--                       defaults-ами (відрізняється від `module_data`,
--                       де ці поля nullable). Bizarre legacy nullability
--                       на `module_data` залежить від drizzle-default-у;
--                       тут фіксуємо одразу правильно.
--
-- ─── Backfill ──────────────────────────────────────────────────────────
--
-- INSERT … SELECT з `module_data WHERE module = 'coach'`. Idempotent через
-- ON CONFLICT (user_id) DO UPDATE SET version = coach_memory.version (no-op
-- update щоб тригернути ON CONFLICT path без зміни data-and-version-у).
--
-- На момент написання — pre-launch single-user, тож бек-філ копіює <= 1 рядок.
--
-- ─── FK ────────────────────────────────────────────────────────────────
--
-- ON DELETE CASCADE — coach memory тримає тільки агрегати (digests
-- summaries, insight texts), без зовнішніх залежностей. Видалення
-- юзер-аккаунту тригерить cleanup автоматично.
--
-- ─── Verification ──────────────────────────────────────────────────────
--
-- 1. `SELECT COUNT(*) FROM coach_memory;`
-- 2. `SELECT user_id, version, length(data::text) FROM coach_memory ORDER BY user_id LIMIT 5;`
-- 3. Перевірити що application read-and-write через нову таблицю
--    (`apps/server/src/modules/chat/coach.ts` оновлено в same PR).
--
-- Down: `045_coach_memory_table.down.sql` — DROP TABLE coach_memory.
-- Backfill row-и НЕ повертаються в `module_data` автоматично (хто хоче
-- rollback — повинен мати dump). На момент drop-у row-и в module_data
-- ще присутні (drop column = окрема міграція 046 у наступному PR), тому
-- restore-ризик — нульовий.

CREATE TABLE IF NOT EXISTS coach_memory (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  client_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coach_memory_user_fk
    FOREIGN KEY (user_id)
    REFERENCES "user" (id)
    ON DELETE CASCADE
);

-- Backfill — копіюємо існуючі coach-records з `module_data`. Idempotent:
-- якщо row-у з тим же user_id вже існує (запуск повторний), залишаємо як
-- є (`DO UPDATE SET user_id = EXCLUDED.user_id` — no-op, щоб уникнути
-- coalescing-у проти ON CONFLICT (..., user_id) IS NULL gap у драйверу).
INSERT INTO coach_memory (user_id, data, version, client_updated_at, server_updated_at)
SELECT
  user_id,
  COALESCE(data, '{}'::jsonb),
  COALESCE(version, 1),
  COALESCE(client_updated_at, NOW()),
  COALESCE(server_updated_at, NOW())
FROM module_data
WHERE module = 'coach'
ON CONFLICT (user_id) DO NOTHING;
