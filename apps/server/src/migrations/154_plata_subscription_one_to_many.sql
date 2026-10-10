-- 154: plata_subscription 1:N (аудит 2026-10-01, data-21).
--
-- Контекст: 133 зробила `user_id` первинним ключем, тож другий checkout
-- перезаписував `subscription_id` (`ON CONFLICT (user_id) DO UPDATE`). Вебхук
-- і звірка за старим id більше не знаходили рядка (`plata_webhook_unresolved`),
-- а оплачена перша підписка лишалась без Pro і без шансу на скасування.
--
-- Що змінюється:
--   1. PK переїздить з `user_id` на `subscription_id` (колонка вже була
--      NOT NULL UNIQUE, тож дублів бути не може); окреме UNIQUE-обмеження
--      знімається, бо PK його замінює. На `user_id` зʼявляється звичайний
--      індекс (пошук усіх підписок користувача).
--   2. `superseded_at` - мітка «цю рекурентку ми самі скасували, бо її
--      замінила нова». Звірка пропускає такі рядки: інакше запізнілий
--      вебхук/тік по старій підписці (monobank ще міг показувати `active`) міг
--      би «воскресити» її і скасувати вже нову.
--   3. Backfill: активні plata-підписки з `subscriptions`, чий id відсутній у
--      мапінгу (його затер другий checkout), додаються назад - тепер вебхук
--      по такому id резолвиться.
--
-- Адитивно щодо даних: жоден рядок не видаляється, жодна колонка не
-- знімається. Ідемпотентно (guard на форму PK). Провайдери на проді вимкнені
-- (PLATA_ENABLED=false), таблиця практично порожня.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'plata_subscription'::regclass
       AND conname = 'plata_subscription_pkey'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id)'
  ) THEN
    ALTER TABLE plata_subscription DROP CONSTRAINT plata_subscription_pkey;
    ALTER TABLE plata_subscription
      DROP CONSTRAINT IF EXISTS plata_subscription_subscription_id_key;
    ALTER TABLE plata_subscription
      ADD CONSTRAINT plata_subscription_pkey PRIMARY KEY (subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS plata_subscription_user_id_idx
  ON plata_subscription (user_id, created_at DESC);

ALTER TABLE plata_subscription
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- Backfill 1:1 -> 1:N: id живої plata-підписки, якого немає в мапінгу.
INSERT INTO plata_subscription (user_id, subscription_id, confirmed_at)
SELECT s.user_id, s.provider_subscription_id, NOW()
  FROM subscriptions s
 WHERE s.provider = 'plata'
   AND s.provider_subscription_id IS NOT NULL
   AND s.status IN ('active', 'trialing', 'past_due')
ON CONFLICT (subscription_id) DO NOTHING;

COMMENT ON TABLE plata_subscription IS
  'user ↔ monobank subscriptionId, 1:N (subscription/create не має reference; кожен checkout - новий рядок). confirmed_at ставиться звіркою (plataSync.ts) після першого підтвердженого subscription/status; NULL + created_at < 1h - предмет швидкого тику і ознака живого checkout (409 CHECKOUT_PENDING). superseded_at - рекурентку скасовано, бо її замінила нова підписка.';
COMMENT ON COLUMN plata_subscription.superseded_at IS
  'Коли ми скасували цю рекурентку як замінену новою підпискою (повторне/крос-провайдерне скасування). Звірка такі рядки пропускає.';
