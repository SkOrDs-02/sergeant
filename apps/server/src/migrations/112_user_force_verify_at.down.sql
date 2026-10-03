-- Down для 112_user_force_verify_at.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Прод-rollback rule (doc §"Roll-back action") — це UPDATE
-- (SET NULL), не DROP; цей down.sql існує лише для rollback-sanity drill.

ALTER TABLE "user"
  DROP COLUMN IF EXISTS force_verify_at;
