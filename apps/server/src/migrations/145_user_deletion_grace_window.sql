-- 145: 30-денне вікно на скасування видалення акаунта.
--
-- Контекст: ADR-0016 § ADR-6.1 фіксує soft-delete із 30-денним вікном і
-- наступним автоматичним добиванням, але реалізовано було негайне
-- `DELETE FROM "user"` у `modules/me/dataRights.ts`. Спека
-- docs/work/specs/user-deletion-grace-window.md закриває саме цю
-- розбіжність.
--
-- `NULL` = акаунт активний; заповнена мітка = акаунт у вікні, остаточне
-- видалення настає через `ACCOUNT_DELETION_GRACE_DAYS` (packages/shared)
-- після неї. Окремої таблиці немає навмисно: стан бінарний, належить
-- рядку користувача і читається на кожному автентифікованому запиті
-- (гейт у `http/requireSession.ts`).
--
-- Additive-зміна: лише ADD COLUMN, двофазний DROP (Hard Rule #4) тут не
-- потрібен, бо нічого не зникає.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- Частковий індекс, а не повний: рядків із заповненою міткою одиниці на
-- всю таблицю, і саме їх щогодини сканує добивач
-- (`modules/me/deletionPoller.ts`). Повний індекс коштував би обсягом
-- усієї таблиці заради тих самих одиниць рядків.
CREATE INDEX IF NOT EXISTS user_deletion_requested_at_idx
  ON "user" (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

COMMENT ON COLUMN "user".deletion_requested_at IS
  'ADR-0016 § ADR-6.1: мітка прохання видалити акаунт. NULL = активний. Добиває modules/me/deletionPoller.ts через ACCOUNT_DELETION_GRACE_DAYS днів.';
