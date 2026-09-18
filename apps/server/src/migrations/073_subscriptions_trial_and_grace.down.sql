-- 073 down: drop trial_ends_at + grace_period_ends_at columns.
--
-- Hard Rule #4: production runs forward-only (Railway); цей файл — local
-- rollback для dev/preview. Production-drop вимагав би two-phase:
--   Phase A (forward, цей файл): ADD COLUMN.
--   Phase B (окрема майбутня migration): deploy app code що не читає
--     ці colum-и → потім DROP COLUMN.
--
-- Тут (rollback першої migration що додала colum-и) drop безпечний:
-- ніяка production-app ще не залежить від них.

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS grace_period_ends_at;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS trial_ends_at;
