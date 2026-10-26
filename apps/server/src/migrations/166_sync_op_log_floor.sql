-- 166: нижня межа журналу `sync_op_log` per-user (ADR-0105 §3.1, аудит
-- 2026-10-01 rel-06).
--
-- Навіщо. Retention `applied`-оп-ів (ADR-0105 §2, вмикається пізніше
-- прапорцем) видалятиме старі рядки журналу. Пристрій, чий курсор `since`
-- старший за видалене, не може «продовжити з курсора»: пропущені оп-и вже
-- зникли, і він тихо втратив би зміни. `floor_id` - максимальний `id`,
-- видалений retention-ом для цього користувача; pull із `since < floor_id`
-- відповідає `410 sync_cursor_expired`, і клієнт іде через
-- `GET /api/v2/sync/snapshot`.
--
-- Зараз таблицю ніхто не заповнює (retention-джоба ще немає), тож рядків
-- немає, floor = 0 для всіх, і поведінка pull не змінюється. Писатиме її
-- retention-крок у тій самій транзакції, що й `DELETE` з журналу.
--
-- Additive, single-phase: лише нова таблиця (Hard Rule #4, двофазність не
-- потрібна). Видалення акаунта прибирає рядок каскадом (FK на "user"(id)).

CREATE TABLE IF NOT EXISTS sync_op_log_floor (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  floor_id    BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sync_op_log_floor IS
  'Нижня межа sync_op_log per-user (ADR-0105): максимальний id, видалений retention-ом. Pull із since < floor_id -> 410 sync_cursor_expired, клієнт бере snapshot. Видаляється каскадом разом з акаунтом.';
