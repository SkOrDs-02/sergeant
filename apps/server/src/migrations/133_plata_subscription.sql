-- 132: Plata by mono — native monobank subscriptions replace the
-- self-managed card-token recurring (plata-recurring spec, 2026-09-01).
--
-- Контекст: monopay має провайдер-керований auto-subscribe
-- (`subscription/create` + `subscription/status`), тож наш власний
-- scheduler + шифрований card-token більше не потрібні (видалені у цьому
-- ж PR: plataScheduler.ts, invoice/wallet-payment флоу).
--
-- plata_subscription — мапінг user_id ↔ monobank subscriptionId.
-- `subscription/create` НЕ повертає `reference` (на відміну від
-- `invoice/create`), тож цей звʼязок фіксується нами самими, у момент
-- створення checkout-сесії, ДО редиректу на pageUrl. `confirmed_at`
-- проставляється звіркою (`plataSync.ts`) після першого підтвердженого
-- `subscription/status`; NULL + `created_at` молодший за годину — предмет
-- швидкого тику полінгу.
--
-- DROP TABLE plata_card_token: свідоме відхилення від Hard Rule #4
-- (two-phase DROP) — фіча ніколи не була ввімкнена (PLATA_ENABLED=false від
-- народження), таблиця гарантовано порожня, ризику втрати даних немає.
-- Down-міграція відтворює її точно за 082_plata_card_token.sql.
--
-- ALLOW_DROP: PLATA_ENABLED=false від народження фічі, plata_card_token
-- гарантовано порожня — див. spec § Рішення дизайну «Прибирання одним PR».

CREATE TABLE IF NOT EXISTS plata_subscription (
  user_id         TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL UNIQUE,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plata_subscription IS
  'user_id ↔ monobank subscriptionId (subscription/create не має reference). confirmed_at ставиться звіркою (plataSync.ts) після першого підтвердженого subscription/status; NULL + created_at < 1h — предмет швидкого тику полінгу.';

DROP TABLE IF EXISTS plata_card_token;
