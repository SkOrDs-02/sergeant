-- 122: import_batches — журнал батчів масового ведення (Фаза 2
-- чек-скан спеки, спільний шар з ініціативою
-- 0022-import-from-external-trackers).
--
-- Спека: docs/90-work/planning/specs/receipt-scan.md
-- § «Фаза 2 — Масове ведення» → «Рішення дизайну Фази 2» →
-- «Журнал батчів + undo». Ця міграція — схема-only:
-- multipart-приймач, bulk-review, дедуп, commit/undo-ендпоінти
-- (apps/server/src/modules/finyk/import/ або спільний modules/import/,
-- рішення на імплементації) — окремий PR.
--
-- Координація (як і `receipts` у 121 з силпо-спекою): якщо ініціатива
-- 0022 уже створила журнал батчів під іншою назвою до цієї міграції —
-- розширювати ту таблицю, а не заводити паралельну. Станом на цю
-- міграцію `import_batches` у БД не було (перевірено перед створенням).
--
-- ─── Навіщо журнал і чому created_row_ids обовʼязковий ─────────────
--
-- Кожен запуск масового імпорту (batch-чеки, скрін банкінгу, виписка
-- CSV/XLS) створює N рядків (receipts / finyk_manual_expenses) і
-- M лінків. «Скасувати імпорт» — tombstone усіх рядків БАТЧУ наявною
-- delete-механікою sync; без списку створених id немає способу
-- відрізнити «рядки цього батчу» від «рядки, які користувач додав
-- вручну між батчами» — спека прямо каже: «без цього списку батч не
-- відкотити, тому він обовʼязковий». Звідси
-- `created_row_ids JSONB NOT NULL DEFAULT '[]'` — NOT NULL за тим самим
-- патерном, що всі JSONB-масиви в per-row+JSONB таблицях цього репо
-- (finyk_prefs.dismissed_recurring, finyk_mono_debt_links.debt_ids_json
-- тощо): відсутність рядків — порожній масив, не NULL. Значення в
-- масиві — мішаного типу залежно від того, що саме створив батч
-- (receipts.id — bigint, finyk_manual_expenses.id — text); JSONB це
-- не типізує, тож caller (undo-хендлер) розрізняє за формою значення
-- або за паралельним service-полем поза скоупом цієї міграції.
--
-- `file_hash` — журнальний атрибут (аудит «який файл дав ці рядки»),
-- НЕ ключ дедуплікації — дедуп повторного upload-у того самого файлу
-- робить детермінований `id = imp1:<sha256(row-key)>` на РЯДКАХ
-- (finyk_manual_expenses, наявний sync-шлях), не ця таблиця. Тому
-- `file_hash` без UNIQUE і nullable (скрін-джерела можуть не мати
-- файлу в класичному сенсі).
--
-- `source` / `status` — навмисно TEXT БЕЗ CHECK: `source` росте разом
-- із «Картою джерел» спеки (receipt_batch → bank_screenshot →
-- bank_statement → можливий bank_statement_pdf за гейтом § питання 3),
-- а `status` — словник воркфлоу, який ще не зафіксований жодним PR-ом
-- реалізації (Stage 2 цього фіче-ланцюжка). Той самий підхід, що
-- `fizruk_injuries.site` (097): словник живе в коді домену і буде
-- розширюватись дешевше без міграції на кожне нове значення. Обидві
-- колонки NOT NULL без DEFAULT — insert завжди зобовʼязаний передати
-- явне значення, а не мовчки покластись на вигаданий тут дефолт, чию
-- семантику Stage 2 ще не визначив.
--
-- `rows_total` / `rows_created` / `rows_linked` / `rows_skipped` —
-- підсумкові лічильники з відповіді `POST /api/finyk/import/commit`
-- (`{batch_id, created, linked, skipped}` у спеці); DEFAULT 0, бо
-- рядок батчу створюється на старті обробки, до того як лічильники
-- відомі.

CREATE TABLE IF NOT EXISTS import_batches (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  file_hash         TEXT,
  status            TEXT NOT NULL,
  rows_total        INTEGER NOT NULL DEFAULT 0,
  rows_created      INTEGER NOT NULL DEFAULT 0,
  rows_linked       INTEGER NOT NULL DEFAULT 0,
  rows_skipped      INTEGER NOT NULL DEFAULT 0,
  created_row_ids   JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- «Журнал моїх імпортів» — найсвіжіші перші. Спека прямо описує лише
-- GET .../batches/:id (point-lookup по PK), але user-scoped історія за
-- created_at — той самий патерн, що решта «історія за user_id»
-- індексів цього репо (напр. apple_iap_receipts_user_verified_idx).
CREATE INDEX IF NOT EXISTS import_batches_user_created_at_idx
  ON import_batches (user_id, created_at DESC);

COMMENT ON TABLE import_batches IS
  'Журнал батчів масового ведення (Фаза 2 receipt-scan спеки + спільний шар ініціативи 0022-import-from-external-trackers). created_row_ids — обовʼязковий список створених id для undo (tombstone наявною delete-механікою sync, docs/90-work/planning/specs/receipt-scan.md § Журнал батчів + undo). source/status навмисно без CHECK — словники ще не зафіксовані жодним PR реалізації.';

COMMENT ON COLUMN import_batches.file_hash IS
  'Журнальний атрибут (аудит "який файл дав ці рядки"), НЕ ключ дедуплікації. Повторний upload того самого файлу дедуплікується на рівні рядків (imp1:<sha256(row-key)> id), не тут.';

COMMENT ON COLUMN import_batches.created_row_ids IS
  'Список id рядків (receipts.id / finyk_manual_expenses.id), створених цим батчем. Без нього "Скасувати імпорт" не має що tombstone-ити — обовʼязковий, не опційний журнальний атрибут.';

COMMENT ON COLUMN import_batches.status IS
  'Статус обробки батчу. Навмисно без CHECK: словник статусів (pending/processing/completed/... — точні значення) визначає Stage 2 (модуль finyk/import), ще не написаний на момент цієї міграції.';
