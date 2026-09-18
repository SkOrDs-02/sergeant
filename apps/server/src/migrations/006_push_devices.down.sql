-- Rollback для `006_push_devices.sql`.
--
-- Цей файл НЕ виконується автоматично `scripts/migrate.mjs` (runner
-- лише apply-forward). Це свідома ручна операція: щоб відкотити push_devices,
-- DBA виконує цей SQL через psql у maintenance-вікні, а потім видаляє
-- відповідний запис з `schema_migrations`:
--
--   psql $DATABASE_URL -f server/migrations/006_push_devices.down.sql
--   psql $DATABASE_URL -c \
--     "DELETE FROM schema_migrations WHERE name = '006_push_devices.sql'"
--
-- Ідемпотентно — повторний прогін не падає.

DROP INDEX IF EXISTS idx_push_devices_user_active;
DROP INDEX IF EXISTS idx_push_devices_platform_token;
DROP TABLE IF EXISTS push_devices;
