-- 071 down: drop apple_original_transaction_id column.
--
-- Hard Rule #4: production runs forward-only (Railway); цей файл — local
-- rollback для dev/preview. У prod-PR-і column-drop вимагає two-phase:
--   Phase A (this migration's forward): ADD COLUMN.
--   Phase B (окрема майбутня migration якщо колись потрібно знести):
--     deploy app code що не читає column → потім DROP COLUMN.
--
-- Тут (local rollback) дроп проходить single-shot бо ніяка production-app
-- ще не залежить від column-а — це ж rollback першої migration що його
-- додала.

DROP INDEX IF EXISTS subscriptions_apple_oti_idx;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS apple_original_transaction_id;
