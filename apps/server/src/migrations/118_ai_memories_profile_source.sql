-- 118: ai_memories `profile`-source — дзеркало явно заявлених фактів
-- користувача ПРО СЕБЕ у семантичну пам'ять (L-8, аудит Профілю/Налаштувань
-- 2026-08-08,
-- docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md).
--
-- Контекст (двофазний процес — docstring `ALLOWED_MEMORY_SOURCES` у
-- apps/server/src/modules/ai-memory/types.ts): це PR ФАЗИ 1 — бампимо
-- ALLOWED_MEMORY_SOURCES + relax-имо CHECK-constraint. Ingestion-hook, що
-- РЕАЛЬНО пише source='profile' рядки, приземляється окремим PR-ом (Фаза
-- 2). До того моменту source лишається "дозволеним, але порожнім" — так
-- само, як 025 (foundation-only) чекала на PR#N+1 для перших
-- ingestion-hooks.
--
-- ─── Семантика ─────────────────────────────────────────────────────────
--
-- `profile` — факти, які людина ввела ПРО СЕБЕ ЯВНО: через інтерв'ю з
-- асистентом (`my_profile` клієнтський тул,
-- `apps/web/src/core/lib/chatActions/crossActions/memoryHandlers.ts`) або
-- вручну на екрані профілю. Джерело правди — client-side «банк пам'яті»
-- (localStorage-ключ `hub_user_profile_v1`, `USER_PROFILE` у
-- `packages/shared/src/sync/modules.ts`), дзеркальований серверним
-- write-through сховищем `user_profile` (міграція 115, одна колонка
-- `payload` JSONB, upsert по `user_id`).
--
-- Це НЕ:
--   * `product`   — поведінкові events з PostHog (068), auto-generated
--                   structured text, не власноруч заявлений факт.
--   * `chat`      — витяг із chat-turn-ів (майбутній PR3-affordance "save
--                   this to memory").
--   * `cofounder` — founder-DM з OpenClaw (028), strict-isolation
--                   namespace, інша аудиторія читання.
-- `profile` — явно заявлений факт про самого користувача, а не поведінкове
-- спостереження чи витяг із розмови.
--
-- ─── Чому окремий source, а не розширення `chat` ──────────────────────
--
-- Recall-фільтри по source-ах уже використовуються для ізоляції: openclaw
-- `recall_memory` tool хардкодить `sources=['cofounder']`
-- (apps/server/src/modules/openclaw/tools.ts). Та сама логіка ізоляції тут
-- працює навпаки — якби `profile`-факти писались як `source='chat'` із
-- distinct `metadata.kind`, стало б неможливо окремо:
--   1. відкликати ЛИШЕ явно заявлені факти при зміні consent-у (аудит
--      L-8: consent-гейт `ai_memory` — вимкнений consent не блокує запис
--      у `user_profile`, лише блокує RAG-дзеркалення; повторне вимкнення
--      має вміти видалити ТІЛЬКИ profile-рядки, не чіпаючи chat-history);
--   2. почистити дублі при reconciliation після редагування профілю без
--      ризику зачепити chat-витяги того самого юзера.
--
-- ─── source_ref — ВАЖЛИВЕ уточнення щодо idempotency ──────────────────
--
-- `source_ref` = локальний id факту з банку пам'яті (entry id усередині
-- client-side `USER_PROFILE`-блобу). Це НЕ DB-level idempotency guard:
-- індекс `ai_memories_source_ref_idx` з міграції 025 —
-- `CREATE INDEX` (НЕ `CREATE UNIQUE INDEX`), звичайний partial B-tree по
-- `(user_id, source, source_ref) WHERE source_ref IS NOT NULL`, доданий
-- лише для швидкого lookup-у ("чи існує вже memory для цього
-- mono-tx/digest-week/факту"). `PARTITION BY HASH (user_id)` (025) не
-- приймає UNIQUE-constraint поза partition key, тому фактичну
-- unique-семантику на цій таблиці й сьогодні тримає caller — той самий
-- контракт, що вже задокументований у коментарі
-- `vectorStore.ts::upsert()`: "Конфлікт unique (user_id, source,
-- source_ref) → ON CONFLICT не використовуємо: партиція не має
-- unique-constraint-у на ці 3 стовпці... caller відповідальний за
-- unique-логіку". Ingestion-hook (Фаза 2) має сам реалізувати
-- SELECT-перед-INSERT або DELETE+INSERT на повторному пуші того самого
-- профілю — деталі того PR-а; тут лише явний коментар-нагадування, щоб
-- майбутній автор Фази 2 не покладався на constraint, якого насправді
-- немає.
--
-- ─── Партиційний caveat (перевірено проти 025, не скопійовано на віру) ──
--
-- `ai_memories` HASH-партиційована на 32 партиції (025,
-- `PARTITION BY HASH (user_id)`, `ai_memories_p00`..`ai_memories_p31`).
-- `DROP CONSTRAINT` / `ADD CONSTRAINT` на parent-таблиці каскадиться в
-- кожну партицію автоматично (стандартна поведінка декларативного
-- партиціонування Postgres ≥11 — CHECK-constraint-и батька успадковуються
-- партиціями, і окрема партиція навіть не дозволяє видалити успадкований
-- constraint напряму). Тому `ALTER TABLE` потрібен лише для `ai_memories`
-- (parent) — той самий підхід, що вже застосований у 028 і 068.

ALTER TABLE ai_memories
  DROP CONSTRAINT IF EXISTS ai_memories_source_check;

ALTER TABLE ai_memories
  ADD CONSTRAINT ai_memories_source_check
  CHECK (source IN (
    'chat',
    'finyk',
    'fizruk',
    'nutrition',
    'routine',
    'journal',
    'digest',
    'cofounder',
    'product',
    'profile'
  ));

COMMENT ON CONSTRAINT ai_memories_source_check ON ai_memories IS
  'Доменний source. Розширено: 028 -> ''cofounder'' (ADR-0031, OpenClaw v0), 068 -> ''product'' (PostHog -> AI memory sync), 118 -> ''profile'' (явно заявлені факти користувача про себе, L-8 аудит 2026-08-08). Ingestion-hook для ''profile'' приземляється окремим PR (Фаза 2, див. docstring ALLOWED_MEMORY_SOURCES у ai-memory/types.ts) - до того моменту CHECK дозволяє значення, яке ще ніхто не пише.';
