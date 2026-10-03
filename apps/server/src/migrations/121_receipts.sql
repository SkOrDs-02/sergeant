-- 121: receipts + receipt_items + finyk_tx_receipt_links — чек-скан v1
-- (QR/ДПС + vision → draft → matcher → receipt + manual expense).
--
-- Спека: docs/90-work/planning/specs/receipt-scan.md § «Модель даних».
-- Ця міграція — схема-only: lookup/analyze/save-ендпоінти й matcher
-- (apps/server/src/modules/finyk/receipts/) приземляються окремим PR
-- (Stage 2/3 скводу доставки).
--
-- ─── receipts ────────────────────────────────────────────────────────
--
-- Один рядок = один розпізнаний чек, незалежно від джерела. `source`:
--   * 'dps'    — QR фіскального чека → офіційний API ДПС (chkAll),
--                структуровані позиції, $0/чек.
--   * 'vision' — фото без QR → OpenRouter (gemini-2.5-flash-lite);
--                менш точне (review-екран показує бейдж «перевір суми»).
--   * 'silpo'  — зарезервовано для координації зі
--                docs/90-work/planning/specs/silpo-mcp-integration.md:
--                якщо той етап приземлиться першим і вже створить таблиці
--                чеків (або навпаки) — писати в ЦЮ сімʼю, не заводити
--                паралельну. Станом на цю міграцію жодної *receipts*
--                таблиці зі спеки Сільпо в БД не було (перевірено перед
--                створенням).
--
-- `fiscal_num` — фіскальний номер чека з QR (`fn` у URL ДПС кабінету);
-- NULL для vision-чеків без QR. Партіальний UNIQUE нижче на
-- `(user_id, fiscal_num) WHERE fiscal_num IS NOT NULL` робить повторний
-- скан того самого чека ідемпотентним no-op (спека: «повторний скан
-- того ж чека НЕ створює дубль»). `source` у ключі НЕМАЄ навмисно
-- (ревʼю PR #818): фіскальний номер ідентифікує паперовий чек незалежно
-- від шляху потрапляння — ДПС-скан сьогодні і silpo-історія завтра
-- мають злитись в один рядок, інакше silpo-шлях продублював би вже
-- засканований чек разом із витратою.
--
-- `total_kopiykas BIGINT` — Hard Rule #1: `pg` повертає bigint як
-- string — coerce до `number` у серіалізаторі, ніколи не віддавати
-- рядок API-споживачу чи в RQ-кеш.
--
-- `raw_payload JSONB NOT NULL` без дефолту — сирий XML від ДПС
-- (серіалізований у JSON перед збереженням) чи JSON-відповідь vision.
-- Кожен insert зобовʼязаний нести реальний payload джерела (той самий
-- контракт, що `mono_transaction.raw`, 008) — порожній дефолт мовчки
-- приховав би зламаний парсинг. Може містити адресу магазину — не
-- піднімати в логи понад pino-редакцію (Hard Rule #21).
--
-- `store_name TEXT NOT NULL` без дефолту — review-екран обовʼязковий
-- (спека: «нічого не зберігається без явного "Зберегти"»), тож на
-- момент запису в `receipts` (POST /api/finyk/receipts, ПІСЛЯ
-- підтвердження користувача) назва магазину вже відома або з
-- ДПС/vision, або відредагована вручну. Порожній дефолт приховав би
-- зламаний парсинг замість падіння на app-рівні — застосунок має сам
-- підставити фолбек (напр. «Невідомий магазин»), якщо джерело його не
-- дало, до INSERT-у.
--
-- Читацькі патерни:
--   1. Ідемпотентний повторний скан — партіальний UNIQUE нижче.
--   2. «Мої чеки за період» / matcher-вибірка по користувачу — індекс
--      (user_id, purchased_at DESC).
--
-- ─── receipt_items ───────────────────────────────────────────────────
--
-- Позиції чека для розгортки транзакції (спека § Флоу v1: «Транзакція з
-- чеком розгортається у список покупок»). `position` — порядок рядка в
-- чеку як його віддав парсер ДПС/vision (просте зберігання, без
-- перевпорядкування). `qty NUMERIC(12,3)` — вагові товари (0.345 кг),
-- DEFAULT 1 для рядків без явної кількості. `price_kopiykas` /
-- `sum_kopiykas BIGINT` — Hard Rule #1, coerce у серіалізаторі.
-- `created_at` доданий понад буквальний перелік колонок спеки —
-- єдиний timestamp-виняток у цій міграції, обґрунтування в
-- COMMENT ON COLUMN нижче.
--
-- ─── finyk_tx_receipt_links ──────────────────────────────────────────
--
-- Matcher-результат (спека § «Дедуп»): чек шукає mono-транзакцію (сума +
-- дата ±1 доба Kyiv). Знайшов → лінк (`tx_kind='mono'`, `tx_ref` =
-- `mono_transaction.mono_tx_id`); не знайшов → створюється manual
-- expense і лінк на неї (`tx_kind='manual'`, `tx_ref` = її `id`).
-- `tx_ref` без FK навмисно — `tx_kind` вказує на ОДНУ з двох різних
-- таблиць із різною формою ключа (`mono_transaction` — композитний PK
-- `(user_id, mono_tx_id)`, `finyk_manual_expenses` — текстовий `id`), а
-- Postgres не має поліморфного FK; той самий компроміс уже прийнятий
-- для `mono_transaction.receipt_id` (008, інше поле — Monobank-івський
-- receiptId з їхнього statement API, НЕ FK на цю нову таблицю).
--
-- `receipt_id` — сам PRIMARY KEY (не окремий bigserial + окремий
-- UNIQUE): звʼязок 1:1 з `receipts`, той самий патерн одно-рядкових
-- таблиць, що `mono_connection.user_id PK` і `finyk_prefs.user_id PK`.
-- Спека просила `UNIQUE(receipt_id)`; PK на тому самому стовпці дає те
-- саме обмеження плюс NOT NULL, без зайвого сурогатного id.
--
-- Індекс `(tx_kind, tx_ref)` — за межами буквального переліку колонок
-- зі спеки, доданий тому, що спека прямо описує зворотний запит:
-- «у списку транзакцій рядок з привʼязаним чеком отримує індикатор»
-- (§ Web UI, § Розгортка) — запит ВІД транзакції ДО чека. Без індексу
-- це було б послідовне сканування таблиці на кожен рендер списку
-- транзакцій. Caveat для читача: `tx_ref` тут НЕ гарантовано глобально
-- унікальний поза межами `user_id` на рівні схеми (composite PK
-- `mono_transaction` теж включає `user_id`) — практично колізія між
-- різними користувачами астрономічно малоймовірна (Monobank tx-id та
-- `finyk_manual_expenses.id` — по суті UUID-подібні рядки), але виклик
-- API має JOIN-ити через уже user-scoped список tx_ref, а не довіряти
-- індексу самому по собі як межі ізоляції користувачів.

CREATE TABLE IF NOT EXISTS receipts (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  fiscal_num        TEXT,
  store_name        TEXT NOT NULL,
  store_tax_id      TEXT,
  purchased_at      TIMESTAMPTZ NOT NULL,
  total_kopiykas    BIGINT NOT NULL,
  raw_payload       JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT receipts_source_check CHECK (source IN ('dps', 'vision', 'silpo'))
);

-- Ідемпотентний повторний скан того самого чека — no-op замість дубля,
-- крос-джерельно (без source у ключі: dps-скан і майбутня silpo-історія
-- того самого фіскального чека — один рядок, див. шапку файлу).
-- WHERE fiscal_num IS NOT NULL: vision-чеки без фіскального номера не
-- беруть участі в цьому обмеженні (дедуп для чеків без QR у v1 не
-- визначений спекою).
CREATE UNIQUE INDEX IF NOT EXISTS receipts_user_fiscal_idx
  ON receipts (user_id, fiscal_num)
  WHERE fiscal_num IS NOT NULL;

-- Конкурентна ідемпотентність vision-ретраю (ревʼю PR #818): pre-INSERT
-- SELECT у save.ts ловить лише ПОСЛІДОВНИЙ retry того самого clientScanId;
-- два КОНКУРЕНТНІ запити (подвійний тап / мережевий retry) обидва проходять
-- дедуп-SELECT до першого INSERT-у й без цього індексу створили б два чеки
-- і дві manual-витрати. Партіальний UNIQUE перетворює того, хто програв
-- гонку, на 23505, який save.ts ловить SAVEPOINT-ом і перечитує рядок
-- переможця (той самий патерн, що finyk_tx_receipt_links_tx_idx нижче).
-- Предикат дзеркалить findExistingVisionReceiptByClientScanId: лише
-- vision-чеки БЕЗ fiscal_num (fiscalNum-шлях має власний арбітр вище) і
-- лише з clientScanId у payload (без нього кожен save — новий рядок,
-- задокументована поведінка). jsonb_typeof = 'string' (не просто
-- IS NOT NULL): save.ts читає ключ лише як РЯДОК — нерядкове сміття з
-- opaque клієнтського blob-а (число/об'єкт під тим самим ключем) не
-- потрапляє в індекс і не породжує 23505, якого код не вміє обробити.
CREATE UNIQUE INDEX IF NOT EXISTS receipts_user_client_scan_idx
  ON receipts (user_id, (raw_payload ->> 'clientScanId'))
  WHERE source = 'vision'
    AND fiscal_num IS NULL
    AND jsonb_typeof(raw_payload -> 'clientScanId') = 'string';

-- «Мої чеки за період» + matcher-вибірка по користувачу, найсвіжіші перші.
CREATE INDEX IF NOT EXISTS receipts_user_purchased_at_idx
  ON receipts (user_id, purchased_at DESC);

COMMENT ON TABLE receipts IS
  'Один розпізнаний чек (QR/ДПС, vision-фото, або координація з силпо-спекою). docs/90-work/planning/specs/receipt-scan.md § Модель даних. Ідемпотентний повторний скан того ж чека — partial UNIQUE(user_id, fiscal_num) WHERE fiscal_num IS NOT NULL, крос-джерельний (без source у ключі).';

COMMENT ON COLUMN receipts.total_kopiykas IS
  'Сума чека, kopiykas. Hard Rule #1: pg повертає BIGINT як string — coerce до number у серіалізаторі, ніколи не віддавати рядок API-споживачу чи в RQ-кеш.';

COMMENT ON COLUMN receipts.raw_payload IS
  'Сирий payload джерела (XML з ДПС, серіалізований у JSON перед збереженням; або JSON-відповідь vision-LLM). NOT NULL без дефолту — insert завжди несе реальні дані джерела. Може містити адресу магазину — не піднімати в логи понад pino-редакцію (Hard Rule #21).';

COMMENT ON COLUMN receipts.fiscal_num IS
  'Фіскальний номер чека (fn з QR URL ДПС). NULL для vision-чеків без QR. Разом із user_id — крос-джерельний ключ ідемпотентності повторного сканування (source у ключі немає навмисно).';

CREATE TABLE IF NOT EXISTS receipt_items (
  id                BIGSERIAL PRIMARY KEY,
  receipt_id        BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  name              TEXT NOT NULL,
  qty               NUMERIC(12, 3) NOT NULL DEFAULT 1,
  price_kopiykas    BIGINT NOT NULL,
  sum_kopiykas      BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Postgres НЕ індексує FK автоматично
-- (sergeant-data-and-migrations/references/schema-foreign-key-indexes.md)
-- — цей індекс і покриває FK-джойн, і дає впорядкованість
-- `ORDER BY position` для розгортки транзакції безкоштовно.
-- UNIQUE (ревʼю PR #818): position привласнює writer (save нормалізує
-- порядок позицій у межах чека), тож дубль position можливий лише як
-- баг вставки — унікальність ловить його на межі БД замість
-- недетермінованого порядку в розгортці.
CREATE UNIQUE INDEX IF NOT EXISTS receipt_items_receipt_id_position_idx
  ON receipt_items (receipt_id, position);

COMMENT ON TABLE receipt_items IS
  'Позиції чека для розгортки транзакції (спека § Флоу v1: "Транзакція з чеком розгортається у список покупок"). Пер-позиційна категоризація/TxSplit — поза скоупом v1 (силпо-спека, етапи C/D).';

COMMENT ON COLUMN receipt_items.created_at IS
  'Не в буквальному переліку колонок спеки — додано за універсальною конвенцією цього репо (кожна таблиця несе бодай один timestamp для аудиту/дебагу). Рядки receipt_items незмінні після створення (немає описаного шляху редагування позицій після збереження чека), тому updated_at/deleted_at НЕ додані.';

COMMENT ON COLUMN receipt_items.price_kopiykas IS
  'Ціна за одиницю, kopiykas. Hard Rule #1 — coerce до number у серіалізаторі.';

COMMENT ON COLUMN receipt_items.sum_kopiykas IS
  'Сума позиції (price_kopiykas * qty, округлено джерелом), kopiykas. Hard Rule #1 — coerce до number у серіалізаторі.';

CREATE TABLE IF NOT EXISTS finyk_tx_receipt_links (
  receipt_id        BIGINT PRIMARY KEY REFERENCES receipts(id) ON DELETE CASCADE,
  tx_kind           TEXT NOT NULL,
  tx_ref            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finyk_tx_receipt_links_tx_kind_check CHECK (tx_kind IN ('mono', 'manual'))
);

-- Зворотний lookup «чи має ця транзакція привʼязаний чек» — читається на
-- кожен рендер списку транзакцій finyk (спека § Розгортка). Caveat щодо
-- user-ізоляції — дивись великий коментар про tx_ref вище в шапці файлу.
-- UNIQUE (ревʼю PR #818): кардинальність 1:1 в обидва боки — одна
-- транзакція має щонайбільше один чек (спека: «лінк без дубля»).
-- Save-хендлер трактує 23505 тут як «цей платіж уже має чек»: чек
-- зберігається unmatched (першокласний стан), manual expense НЕ
-- створюється — інакше та сама покупка порахувалась би двічі.
CREATE UNIQUE INDEX IF NOT EXISTS finyk_tx_receipt_links_tx_idx
  ON finyk_tx_receipt_links (tx_kind, tx_ref);

COMMENT ON TABLE finyk_tx_receipt_links IS
  'Matcher-результат: привʼязка чека до mono-транзакції (tx_kind=mono, tx_ref=mono_transaction.mono_tx_id) або до створеної manual expense (tx_kind=manual, tx_ref=finyk_manual_expenses.id). receipt_id — сам PK (1:1 з receipts, патерн mono_connection.user_id). tx_ref без FK: tx_kind вказує на одну з двох таблиць із різною формою ключа — Postgres не має поліморфного FK (той самий компроміс, що mono_transaction.receipt_id, міграція 008).';
