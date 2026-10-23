-- 165: маркер «чеки Сільпо стерто» живе окремо від підключення (аудит
-- 2026-10-01, data-47, залишок після міграції 159).
--
-- Проблема. Міграція 159 поклала маркер `receipts_wiped_at` на рядок
-- `silpo_connection`, а `POST /api/silpo/disconnect` видаляє цей рядок
-- цілком. Ланцюжок «wipe -> disconnect -> reconnect» стирав маркер, і
-- перший синк після повторного підключення повертав усю історію.
--
-- Рішення. Окрема таблиця з одним рядком на користувача. Вона НЕ залежить
-- від `silpo_connection`, тож disconnect її не чіпає. Видалення акаунта
-- прибирає маркер каскадом (FK на "user"(id)), тобто GDPR-видалення
-- лишається повним.
--
-- Additive, single-phase: нова таблиця + бекфіл з колонки 159. Колонка
-- `silpo_connection.receipts_wiped_at` лишається: старий інстанс у вікні
-- викочування пише лише її, тож новий код читає пізніший із двох маркерів і
-- при wipe пише обидва (відкат деплою теж безпечний). Прибирання колонки -
-- окрема двофазна міграція пізніше (Hard Rule #4).

CREATE TABLE IF NOT EXISTS silpo_wipe_marker (
  user_id   TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  wiped_at  TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE silpo_wipe_marker IS
  'Момент останнього POST /api/silpo/wipe. Синк не вставляє замовлення з purchased_at <= wiped_at, auto-claim комори не бронює їх позиції. Переживає disconnect/reconnect; видаляється каскадом разом з акаунтом.';

INSERT INTO silpo_wipe_marker (user_id, wiped_at)
SELECT user_id, receipts_wiped_at
  FROM silpo_connection
 WHERE receipts_wiped_at IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
