-- 157: finyk_tx_tags - теги користувача до операцій Фініка
-- (спека docs/work/specs/planning/finyk-analytics-v3.md, Р6.3: теги
-- синкаються як категорії й нотатки, не через localStorage).
--
-- Форма - як `finyk_tx_notes` (155): composite PK `(user_id, transaction_id)`,
-- де `transaction_id` - id банківської операції або ручного запису
-- (непрозорий TEXT). `tags_json` - JSON-масив рядків із написанням першого
-- вжитку; порівняння без регістру й крайових пробілів робить finyk-domain
-- (Р6.5), не БД. Один рядок на операцію: перейменування чи видалення тегу
-- скрізь - це пачка звичайних upsert-ів по рядках операцій.
--
-- Видалення - soft (`deleted_at`), сумісне з tombstone-ами 156: порожній
-- список тегів на клієнті = tombstone, тож запізнілий upsert зі старого
-- пристрою не воскрешає зняті теги, а новіший запис воскрешає рядок (LWW).
-- Кількість і довжину тегів обмежує застосувач, а не CHECK: перевищений оп
-- має дати чистий reject у відповіді синку, а не фатальну помилку INSERT.
--
-- Forward-only і суто адитивна: нова таблиця, старий код її не знає й не
-- читає, тож порядок «фронт раніше за бекенд» (AGENTS.md § Deployment) не
-- ламає нікого. `.down.sql` - лише для локального відкату.

CREATE TABLE IF NOT EXISTS finyk_tx_tags (
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL,
  tags_json       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_tx_tags_user_active_idx
  ON finyk_tx_tags (user_id)
  WHERE deleted_at IS NULL;
