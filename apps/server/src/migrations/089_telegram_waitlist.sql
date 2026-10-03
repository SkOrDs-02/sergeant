-- Telegram-вейтліст: список тих, хто натиснув Start у боті бети.
-- Спека: docs/90-work/planning/specs/telegram-waitlist.md
--
-- Чому окрема таблиця, а не колонки в `waitlist_entries` (міграція 009):
-- там `email TEXT NOT NULL` + унікальний індекс по `LOWER(email)`. Записи
-- з Telegram пошти не мають узагалі, тож довелося б знімати NOT NULL і
-- переробляти унікальність — двофазна міграція живої таблиці заради
-- nullable-поля. Additive-таблиця дає те саме без ризику.
--
-- Ключове доменне обмеження, з якого росте схема: Telegram-бот не може
-- написати першим. Контакт існує тільки після `/start`, і адресуємо ми
-- завжди `chat_id` — не `@username` (його можна змінити будь-коли).

CREATE TABLE telegram_waitlist (
  id                BIGSERIAL PRIMARY KEY,
  -- Приватний чат: chat_id == telegram user id. Telegram гарантує, що
  -- значення вміщається в 52 біти, тож JS Number його не втрачає
  -- (Hard Rule #1 — коерція bigint -> number у серіалізаторі).
  chat_id           BIGINT NOT NULL UNIQUE,
  -- Знімок профілю на момент /start. Лише довідка для людини: писати
  -- завжди по chat_id.
  telegram_username TEXT,
  first_name        TEXT,
  language_code     TEXT,
  -- Payload deep link-а (`?start=hero`). Атрибуція каналу без трекерів.
  -- Telegram обмежує його 64 символами й набором [A-Za-z0-9_-].
  start_payload     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Коли надіслали інвайт. Стамповиться порядково після успішної
  -- відправки, щоб перерваний прогін розсилки можна було перезапустити.
  notified_at       TIMESTAMPTZ,
  -- /stop або "bot was blocked by the user" (403 від Bot API).
  opted_out_at      TIMESTAMPTZ
);

-- Єдина гаряча вибірка — «кому ще не слали». Частковий індекс тримає в собі
-- лише цих кандидатів, тож не росте разом з уже розісланими.
CREATE INDEX telegram_waitlist_pending_idx
  ON telegram_waitlist (created_at)
  WHERE notified_at IS NULL AND opted_out_at IS NULL;

-- Для звіту «звідки прийшли» (`GROUP BY start_payload`).
CREATE INDEX telegram_waitlist_payload_idx
  ON telegram_waitlist (start_payload);
