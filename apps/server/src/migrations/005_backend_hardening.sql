-- PR D: backend hardening — soft-delete, integrity CHECK-ів, partial-індекси
-- під реальні запити з push.js/sync.js/coach.js/aiQuota.js.
--
-- Усі операції ідемпотентні: міграцію можна повторно програвати на існуючих
-- БД. Перевірки через pg_catalog замість `ADD CONSTRAINT IF NOT EXISTS` (який
-- не підтримується для CHECK у Postgres < 16).

-- ── 1. Soft-delete для push_subscriptions ────────────────────────────────────
-- Чому: `unsubscribe` і cleanup застарілих endpoint-ів у `sendPush` зараз
-- DELETE-ять рядки. Вони корисні для audit/диагностики, а також для
-- переривистих підписок (браузер тимчасово повертає 410 → через годину знову
-- працює). Soft-delete + partial-index на активні рядки зберігає query plan
-- таким самим.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial-індекс замість повного: ~100% запитів (SELECT у sendPush,
-- UPDATE у unsubscribe) фільтрують `deleted_at IS NULL`, тому soft-deleted
-- рядки у індекс не потрапляють і не роздувають його.
CREATE INDEX IF NOT EXISTS idx_push_subs_user_active
  ON push_subscriptions (user_id)
  WHERE deleted_at IS NULL;

-- Старий індекс тепер дублює partial (і гірший — включає soft-deleted).
DROP INDEX IF EXISTS idx_push_subs_user;

-- ── 2. CHECK-constraints на інтегритет даних ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'module_data_version_positive'
  ) THEN
    ALTER TABLE module_data
      ADD CONSTRAINT module_data_version_positive CHECK (version > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subs_endpoint_https'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subs_endpoint_https
        CHECK (endpoint ~ '^https?://');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subs_keys_nonempty'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subs_keys_nonempty
        CHECK (char_length(p256dh) > 0 AND char_length(auth) > 0);
  END IF;

  -- bucket повинен бути або 'default', або 'tool:<name>'. Це ловить очевидні
  -- помилки в коді (напр. випадкове пусте ім'я tool-а).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_daily_bucket_format'
  ) THEN
    ALTER TABLE ai_usage_daily
      ADD CONSTRAINT ai_usage_daily_bucket_format
        CHECK (bucket = 'default' OR bucket LIKE 'tool:_%');
  END IF;
END $$;

-- ── 3. Партіал-індекс на module_data за активними рядками ───────────────────
-- `module_data` наразі soft-delete не використовує (бо sync pull/push
-- перезаписують повний blob), проте ми додаємо колонку з DEFAULT NULL на
-- випадок майбутнього user-delete account flow. Індекс не створюємо поки
-- фіча не реалізована — UNIQUE(user_id, module) уже покриває всі гарячі
-- запити; плодити індекси «на виріст» не варто.
ALTER TABLE module_data
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
