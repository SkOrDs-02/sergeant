-- Migration: routine_streaks_phantom_docs
-- 084: Документування фантомного лічильника `routine_streaks` (audit E-4).
--
-- Контекст
-- --------
-- Назва таблиці обіцяє derived день-стрік, а зберігає вона зовсім інше:
-- монотонний net-лічильник кліків «відмітив/зняв» по ВСІХ звичках разом.
-- Клієнт шле `+1`/`-1` через `enqueueOutboxIncrement` на кожен toggle
-- (`apps/web/src/modules/routine/lib/sqliteWriter/adapter.ts`), сервер
-- застосовує їх PN-counter-семантикою з clamp-ом `>= 0` (`applyRoutineStreaks`
-- у `apps/server/src/modules/sync/routine/applySync.ts`). Одиниця виміру —
-- кліки, а не послідовні дні. Справжній стрік рахується client-side
-- (`streakForHabit`) з `routine_entries`/completions.
--
-- Читачів у UI / push / digest / chat-tools станом на 2026-07-24 — нуль
-- (усі посилання — sync/outbox/migration-обвʼязка). Ризик у тому, що
-- наступний агент прочитає імʼя і зробить пуш «стрік під загрозою» з
-- лічильника кліків.
--
-- Чому лише COMMENT, без DDL
-- --------------------------
-- Рядок `routine_streaks` — одночасно (a) імʼя PG-таблиці, (b) імʼя
-- SQLite-таблиці на вже встановлених web/mobile клієнтах, (c) wire-protocol
-- table key в increment-опах з outbox. Фізичне перейменування потребує
-- координованого web+mobile релізу з app-store лагом — окрема задача
-- (docs/90-work/tech-debt/backend.md § Routine). Ця міграція форму таблиці
-- НЕ змінює: тільки COMMENT ON, ідемпотентно й безпечно.
--
-- Канон: docs/01-product/model/routine.md §4
-- Аудит: docs/90-work/audits/product-knowledge-routine.md § E-4

COMMENT ON TABLE routine_streaks IS
  'PHANTOM NAME. Per-user net-completion click counter (increment-only PN-counter, clamped >= 0) — NOT a derived consecutive-day streak. Do not read for UI/push/digest. Real streak = client-side streakForHabit() over routine_entries. See docs/01-product/model/routine.md §4 and docs/90-work/audits/product-knowledge-routine.md §E-4.';

COMMENT ON COLUMN routine_streaks.current_streak IS
  'Misnomer: net completion-toggle count across ALL habits (clamped >= 0), not a day-based streak. See table comment.';

COMMENT ON COLUMN routine_streaks.longest_streak IS
  'Monotonic max of current_streak history — same misnomer caveat as current_streak. See table comment.';
