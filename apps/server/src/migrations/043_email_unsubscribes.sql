-- 043: FTUX drip opt-out registry (S4.3 of `docs/launch/ftux-sprint-plan.md`).
--
-- Renumbered from 041 → 043 to dedupe a cross-branch number collision with
-- `041_push_send_audit.sql` (M14). Both files merged to `main` within ~23s
-- of each other and then `pnpm lint:migrations` started flagging
-- `Duplicate migration numbers: 041` on every PR. The DDL below is fully
-- idempotent (`CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`),
-- so re-running this file under the new name is a no-op for existing
-- environments. The orphan `041_email_unsubscribes.sql` row in
-- `schema_migrations` on production is cleaned up by
-- `044_rename_041_email_unsubscribes.sql` immediately after this file
-- runs (lexicographic order).
--
--
-- Окрема таблиця per `(user_id, campaign_family)` для тримання opt-out-ів.
-- Чому не стовпчик у `user`-таблиці: opt-out — per-cohort (юзер може
-- відписатись від `ftux_drip` але лишити `transactional` / майбутні family),
-- тому тримаємо composite ключ замість одного boolean.
--
-- `campaign_family` — групує конкретні кампанії: `ftux_drip` ловить усі
-- три листи (Day 0/1/3), один opt-out зупиняє увесь ланцюг. Інші майбутні
-- family (наприклад `digest_weekly`, `winback_30d`) матимуть власні
-- opt-out-и без зачіпання FTUX-у.
--
-- Verification path: `/api/email/unsubscribe?u=<userId>.<hmac>` робить
-- HMAC-SHA256 over `BETTER_AUTH_SECRET` без БД-lookup-у — це публічний
-- ендпоінт без auth, тому ми не маємо session-у. INSERT з ON CONFLICT DO
-- NOTHING — повторний клік на ту саму лінку безпечний.
--
-- Pre-send-check: `email/ftuxDripMail.ts → assertNotUnsubscribed()` робить
-- SELECT 1 перед кожним send-ом і скіпає лист, якщо row знайдено. Plus
-- лог `ftux_drip_skipped_optout` для видимості у Datadog/Sentry.
--
-- Rollback. Local-only via `043_email_unsubscribes.down.sql` (rule #4 —
-- production never runs `down.sql`).

CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  campaign_family TEXT NOT NULL,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'email_footer',
  CONSTRAINT email_unsubscribes_unique UNIQUE (user_id, campaign_family)
);

CREATE INDEX IF NOT EXISTS email_unsubscribes_user_idx
  ON email_unsubscribes (user_id);

COMMENT ON TABLE email_unsubscribes IS
  'Opt-out per (user_id, campaign_family). Перевіряється перед кожним send-ом drip-у (S4.3).';
