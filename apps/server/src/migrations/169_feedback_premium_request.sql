-- 169: запит ручного Premium з пейволу живе в `feedback_entries`
-- (спека docs/work/specs/manual-premium-request.md, П-24..П-26).
--
-- Що додає:
--   1. Категорію `premium_request` у CHECK категорії. Клієнтська схема
--      `FeedbackCategorySchema` її НЕ має: рядок пише лише сервер
--      (`modules/billing/manualAccess.ts`), анонімний `POST /api/feedback`
--      таку категорію не пропустить.
--   2. CHECK «запит Premium завжди має акаунт»: інакше NULL-и обійшли б
--      унікальність з пункту 4.
--   3. Колонку `premium_granted_at`: коли founder видав доступ за цим
--      запитом (NULL = не видано). Ідемпотентність видачі тримається на ній.
--   4. Частковий унікальний індекс: один запит на акаунт за весь час (П-26).
--
-- Назва inline-CHECK з міграції 093 звірена: обмеження без імені, тож
-- Postgres назвав його `feedback_entries_category_check`; пізніших
-- перейменувань у міграціях немає.
--
-- Additive, single-phase. Старий код пише лише idea/bug/other, розширений
-- CHECK їх приймає; нова колонка nullable без дефолту. Таблиця мала (інбокс
-- бети), тож індекс без CONCURRENTLY. `user_id` і далі без FK: запит
-- переживає видалення акаунта, як і решта фідбеку.

-- CHECK категорії: надмножина (idea, bug, other) + premium_request.
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_category_check;
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_category_check
  CHECK (category IN ('idea', 'bug', 'other', 'premium_request'));

-- Запит Premium завжди має акаунт: без цього NULL-и обійшли б унікальність.
-- DROP IF EXISTS перед ADD робить файл безпечним для повторного прогону.
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_premium_request_user_check;
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_premium_request_user_check
  CHECK (category <> 'premium_request' OR user_id IS NOT NULL);

-- Коли founder видав доступ за цим запитом; NULL = не видано.
ALTER TABLE feedback_entries ADD COLUMN IF NOT EXISTS premium_granted_at TIMESTAMPTZ;

-- Один запит на акаунт (П-26).
CREATE UNIQUE INDEX IF NOT EXISTS feedback_entries_premium_request_user_uidx
  ON feedback_entries (user_id)
  WHERE category = 'premium_request';
