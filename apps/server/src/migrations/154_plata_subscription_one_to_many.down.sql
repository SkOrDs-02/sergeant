-- Відкат 154: повернути plata_subscription до 1:1 (PK = user_id).
--
-- Local-only (Rule #4: прод `down.sql` не виконує).
--
-- УВАГА: відкат втрачає дані. Для користувачів з кількома мапінгами лишається
-- один рядок: той, що збігається з живою підпискою в `subscriptions`, інакше
-- найновіший за `created_at`. Решта (id скасованих/замінених підписок)
-- видаляється, бо 1:1-схема їх вмістити не може.

DELETE FROM plata_subscription p
 WHERE p.subscription_id <> (
   SELECT p2.subscription_id
     FROM plata_subscription p2
     LEFT JOIN subscriptions s
       ON s.user_id = p2.user_id
      AND s.provider = 'plata'
      AND s.provider_subscription_id = p2.subscription_id
      AND s.status IN ('active', 'trialing', 'past_due')
    WHERE p2.user_id = p.user_id
    ORDER BY (s.user_id IS NOT NULL) DESC, p2.created_at DESC, p2.subscription_id
    LIMIT 1
 );

DROP INDEX IF EXISTS plata_subscription_user_id_idx;
ALTER TABLE plata_subscription DROP COLUMN IF EXISTS superseded_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'plata_subscription'::regclass
       AND conname = 'plata_subscription_pkey'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (subscription_id)'
  ) THEN
    ALTER TABLE plata_subscription DROP CONSTRAINT plata_subscription_pkey;
    ALTER TABLE plata_subscription
      ADD CONSTRAINT plata_subscription_pkey PRIMARY KEY (user_id);
    ALTER TABLE plata_subscription
      ADD CONSTRAINT plata_subscription_subscription_id_key UNIQUE (subscription_id);
  END IF;
END $$;

COMMENT ON TABLE plata_subscription IS
  'user_id ↔ monobank subscriptionId (subscription/create не має reference). confirmed_at ставиться звіркою (plataSync.ts) після першого підтвердженого subscription/status; NULL + created_at < 1h — предмет швидкого тику полінгу.';
