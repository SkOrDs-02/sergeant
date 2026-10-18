-- 155: finyk_tx_notes — нотатки користувача до банківських операцій
-- (аудит 2026-10-01, data-27; рішення власника 2026-10-08: синк нотаток між
-- пристроями окремим PR після хвиль).
--
-- Контекст. Нотатка до операції — це дані користувача, які він вписує сам
-- (штатний оверлей BankTransactionDetailsSheet, канон finyk.md). До цієї
-- міграції вона жила лише в localStorage одного пристрою
-- (`finyk_tx_notes`) і не синхронізувалась. Таблиця — серверна ціль v2-синку
-- (`OP_LOG_TABLE_REGISTRY`), дзеркало клієнтської SQLite-таблиці з тим самим
-- ім'ям (`004_finyk_tx_notes.sql` у db-schema).
--
-- Форма — composite-PK tombstone (як `finyk_hidden_transactions`), але з
-- корисним навантаженням: `(user_id, transaction_id)` — природний ключ
-- (Mono-id операції, непрозорий TEXT), `note` — вільний текст. Порожня
-- нотатка на клієнті = soft-delete (`deleted_at`), а не рядок з порожнім
-- `note`: tombstone зберігає LWW чесним, коли видалення на пристрої A
-- змагається зі старою правкою з пристрою B (новіший запис воскрешає рядок).
-- Довжину `note` обмежує застосувач (`NOTE_MAX_LEN`), а не БД: CHECK на
-- довжину зробив би кожен перевищений оп фатальною помилкою INSERT замість
-- чистого `text_too_long` у відповіді синку.
--
-- Forward-only і суто адитивна: нова таблиця, старий код її не знає й не
-- читає, тож порядок «фронт раніше за бекенд» (AGENTS.md § Deployment) не
-- ламає нікого. `.down.sql` — лише для локального відкату.

CREATE TABLE IF NOT EXISTS finyk_tx_notes (
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL,
  note            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS finyk_tx_notes_user_active_idx
  ON finyk_tx_notes (user_id)
  WHERE deleted_at IS NULL;
