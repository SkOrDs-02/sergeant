-- Mobile push — реєстр пристроїв для web-push / APNs / FCM.
--
-- Окрема таблиця (а не розширення `push_subscriptions`) тому, що web-push
-- підписки — це `{endpoint, p256dh, auth}` (RFC 8030), а iOS/Android — це
-- device token + platform ID, і семантично це різні сутності: браузерна
-- підписка прив'язана до service-worker-а (може протухнути, браузер
-- генерує нову), нативний токен — до пристрою (ротується лише при
-- переінсталяції). Тримаємо обидві таблиці — `push_subscriptions` лишається
-- авторитетним джерелом для поточного web-push flow, нова `push_devices`
-- обслуговує мобільні клієнти (наступна ітерація реалізує реальну
-- відправку через APNs/FCM).
--
-- Ідемпотентно (`IF NOT EXISTS`). Rollback див. `006_push_devices.down.sql`.

CREATE TABLE IF NOT EXISTS push_devices (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  -- `endpoint` NULLable: web-push присилає URL, native-push — ні. Лишаємо
  -- єдину таблицю замість per-platform, щоб `/api/v1/push/register` мав
  -- один shape відповіді й один query-шлях для lookup-а всіх пристроїв юзера.
  endpoint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT push_devices_platform_valid
    CHECK (platform IN ('web', 'ios', 'android')),
  CONSTRAINT push_devices_token_nonempty
    CHECK (char_length(token) > 0)
);

-- Один і той же token не має дублюватися у межах платформи: reinstall
-- пристрою повертає той самий FCM/APNs token, а нам потрібен upsert
-- (ON CONFLICT DO UPDATE SET user_id=..., updated_at=NOW()).
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_devices_platform_token
  ON push_devices (platform, token);

-- Швидкий lookup "всі активні пристрої юзера" — для розсилки пушу.
-- Partial на активні, щоб soft-deleted не роздували індекс.
CREATE INDEX IF NOT EXISTS idx_push_devices_user_active
  ON push_devices (user_id)
  WHERE deleted_at IS NULL;
