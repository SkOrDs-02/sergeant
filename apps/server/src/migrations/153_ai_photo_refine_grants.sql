-- 153: гранти на refine-photo (sec-14 аудиту 2026-10-01, ADR-0100).
--
-- Правило реєстру доступу: refine ТОГО САМОГО знімка нічого не списує, refine
-- іншого кадру коштує 1 фото з відра `week:photo`. Контракт API не змінюється,
-- тож «той самий знімок» сервер визначає сам: `analyze-photo` після УСПІШНОГО
-- аналізу записує сюди (user_id, SHA-256 кадру), а `refine-photo` не списує
-- квоту, коли для його кадру є грант цього користувача не старший за 24 год.
-- Прострочені рядки підчищає сам код (`modules/nutrition/photoRefineGrant.ts`).
--
-- FK на "user" з ON DELETE CASCADE обовʼязковий: SHA-256 фото користувача не
-- повинен пережити видалення акаунта (`deleteUserData` покладається на каскад,
-- ADR-0016 §4; гейт `141-142-user-scoped-cascade` вимагає FK від кожної
-- таблиці з `user_id`).
--
-- Additive, single-phase, ідемпотентно. RLS-політик на цій схемі ще немає
-- (`dbContext.ts`), тож політику тут не вводимо.

CREATE TABLE IF NOT EXISTS ai_photo_refine_grants (
  user_id      TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  image_sha256 TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, image_sha256)
);

-- Для глобального підчищення прострочених грантів (`WHERE created_at < $1`).
CREATE INDEX IF NOT EXISTS ai_photo_refine_grants_created_at_idx
  ON ai_photo_refine_grants (created_at);

COMMENT ON TABLE ai_photo_refine_grants IS
  'Гранти refine-photo: SHA-256 кадру (image_base64.trim()), який analyze-photo успішно проаналізував для користувача. Refine кадру з грантом молодшим за 24 год не списує week:photo. Рядки підчищає photoRefineGrant.ts.';
