-- 082: Phase 7 UA billing — encrypted storage for the Plata (monobank)
-- recurring-payment card token.
--
-- Контекст: monopay НЕ має провайдер-керованої auto-subscribe (на відміну
-- від LiqPay). Рекурентку тримає наш scheduler (plataScheduler.ts), який
-- щомісяця списує через POST /api/merchant/wallet/payment по збереженому
-- card-token-у. Токен — PII-рівня секрет (дає списувати кошти), тож
-- зберігаємо його зашифровано, дзеркалячи патерн mono_connection (m008):
-- AES-256-GCM, три BYTEA-колонки (ciphertext/iv/tag) + версія ключа з
-- KeyRing (H4).
--
-- Дизайн-вибір (зафіксовано у діфі): ОКРЕМА таблиця, keyed by user_id, а не
-- колонки на subscriptions. Причина: subscriptions має кілька історичних
-- рядків на юзера (canceled + active), а card-token — це per-user
-- credential, не per-subscription. user_id PK + ON DELETE CASCADE точно
-- повторює mono_connection.
--
-- wallet_id — monopay walletId, під яким токенізовано картку (потрібен для
-- wallet/payment і для DELETE /api/merchant/wallet/card при скасуванні).
--
-- Additive: нова таблиця, жодного backfill, two-phase не потрібен.

CREATE TABLE IF NOT EXISTS plata_card_token (
  user_id                TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  wallet_id              TEXT NOT NULL,
  card_token_ciphertext  BYTEA NOT NULL,
  card_token_iv          BYTEA NOT NULL,
  card_token_tag         BYTEA NOT NULL,
  token_key_version      SMALLINT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plata_card_token IS
  'Phase 7 UA billing: зашифрований monopay card-token для рекурентних списань Plata. AES-256-GCM (дзеркалить mono_connection, m008). Видаляється при deletion юзера (CASCADE) та при скасуванні підписки. Ніколи не логувати розшифроване значення (Hard Rule #21).';
