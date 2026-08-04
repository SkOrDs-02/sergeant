-- 112: `"user".force_verify_at` — Phase D gate для email-verification
-- sweep (`docs/01-product/launch/email-verification-sweep.md`).
--
-- Pre-beta schema-debt аудит 2026-08-04. Семантика — Phase D цього doc:
-- per-user timestamp; Better Auth sign-in hook (Stage 2, ще НЕ підключено
-- цією міграцією) читає колонку і, коли `force_verify_at < NOW() AND
-- "emailVerified" = false`, повертає `403 EMAIL_VERIFICATION_REQUIRED`
-- НАВІТЬ якщо глобальний env-флаг `REQUIRE_EMAIL_VERIFICATION=false`.
-- Це дає gradual per-user rollout (спершу когорта legacy-юзерів day 15+),
-- а не hard global cutover.
--
-- Nullable, без DEFAULT: NULL означає «gate ще не застосовано до цього
-- юзера» — увесь rollout керується виключно тим, ХТО отримує НЕ-NULL
-- значення (Stage 2 job виставляє його для конкретної когорти), колонка
-- сама по собі нічого не вмикає.
--
-- Naming note: doc `email-verification-sweep.md` §Phase D називає колонку
-- `forceVerifyAt` (camelCase, у стилі Better Auth). Тут — snake_case
-- `force_verify_at`, за прецедентом `last_seen_at` (міграція 100): нові
-- СЕРВЕРНІ колонки на "user" (не керовані самим Better Auth) у цій схемі
-- йдуть unquoted snake_case, щоб візуально відрізнятись від
-- Better-Auth-керованих `"emailVerified"`/`"createdAt"`. Stage 2 (Better
-- Auth sign-in hook) має читати саме `force_verify_at`; якщо продуктовий
-- doc лишає `forceVerifyAt` — оновіть doc, а не колонку.
--
-- Rollback trigger з doc §"Roll-back action": `UPDATE "user" SET
-- force_verify_at = NULL` — колонка НЕ дропається при відкаті rollout-у,
-- це не data-loss сценарій.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS force_verify_at TIMESTAMPTZ;

COMMENT ON COLUMN "user".force_verify_at IS
  'Phase D gate (email-verification-sweep.md): when set and in the past AND "emailVerified" = false, Better Auth sign-in hook (Stage 2, not yet wired) returns 403 EMAIL_VERIFICATION_REQUIRED regardless of the global REQUIRE_EMAIL_VERIFICATION flag. NULL = gate not applied to this user yet.';
