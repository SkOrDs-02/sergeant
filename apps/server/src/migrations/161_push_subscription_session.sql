-- 161: push_subscriptions.session_id - прив'язка web-push підписки до сесії
-- (аудит 2026-10-01, priv-04, серверна частина).
-- Спека: docs/work/specs/audits/2026-10-01-full-app-audit/privacy.md § priv-04.
--
-- Проблема. Підписка прив'язана лише до `user_id`. Клієнтський `logout()`
-- (#1341) знімає її best-effort, але якщо він не встиг (таймаут, офлайн,
-- сесію завершено з іншого пристрою), фінансові пуші A далі приходять у
-- браузер, яким уже користується B.
--
-- Рішення. `register` пише id сесії, з якої підписку зареєстровано, а
-- `databaseHooks.session.delete.after` у Better Auth soft-delete-ить
-- (`deleted_at = NOW()`) підписки саме цієї сесії. Чужі сесії й підписки
-- без `session_id` (зареєстровані до цієї міграції) не чіпаються.
--
-- Без FK на "session"(id): рядок сесії видаляється, а підписка лишається
-- soft-deleted для аналітики й воскресіння через `OWNERSHIP_SAFE_WEB_UPSERT`.
-- Частковий індекс обслуговує рівно запит хука (`WHERE session_id = $1 AND
-- deleted_at IS NULL`).
--
-- Additive, single-phase (Hard Rule #4): NULL-able колонка, старий код її не
-- знає і не пише, тож вікно «фронт раніше за бекенд» нікого не ламає.
-- `.down.sql` - лише для локального відкату.

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subs_session_active
  ON push_subscriptions (session_id)
  WHERE session_id IS NOT NULL AND deleted_at IS NULL;
