-- Migration: privat_connection
-- Created: 2026-07-31
--
-- PrivatBank merchant-креденшели: серверне зберігання замість браузера.
-- Спека: docs/90-work/planning/specs/beta-security-readiness.md (F1)
--
-- Навіщо ця таблиця. Merchant-токен PrivatBank досі жив у `localStorage`
-- браузера (`finyk_privat_token`), а `/api/privat` брав його із заголовків
-- запиту. Тобто банківський креденшел бачив будь-хто, хто відкриє DevTools
-- -> Application. Monobank цей самий шлях пройшов раніше (міграція 008 +
-- `mono_connection`), і схема нижче — навмисне дзеркало тієї, щоб
-- read/rotate-код можна було перевикористати без розгалуження.
--
-- Additive, single-phase: нова таблиця, жодного ALTER над живими даними,
-- тож two-phase DROP з Hard Rule #4 тут не застосовний.
--
-- Шифрування: AES-256-GCM трьома BYTEA-стовпцями + окремий
-- `token_key_version` — точно як у `mono_connection` після міграції 074.
-- Ключ береться з того самого KeyRing (`MONO_TOKEN_ENC_KEYS`): це та сама
-- довірча зона «банківські токени користувача», а окремий env-ключ додав
-- би ще один секрет до ротації, не змінивши модель загроз.

CREATE TABLE privat_connection (
  user_id           TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  -- Merchant ID — ідентифікатор, а не секрет: сам по собі доступу не дає,
  -- тому лежить відкрито. Потрібен для заголовка `id` upstream-запиту.
  merchant_id       TEXT NOT NULL,
  token_ciphertext  BYTEA NOT NULL,
  token_iv          BYTEA NOT NULL,
  token_tag         BYTEA NOT NULL,
  -- Для нових рядків завжди заповнений; nullable — щоб рідер, спільний з
  -- Mono, міг трактувати NULL як v1 (legacy-сумісність без розгалуження).
  token_key_version SMALLINT,
  -- SHA-256 токена: дає зрозуміти «це той самий токен, що й був» у логах
  -- і при повторному connect, жодного разу не розшифровуючи рядок.
  token_fingerprint TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
