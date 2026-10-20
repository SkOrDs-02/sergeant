-- 160: user_avatars - завантажений аватар користувача (аудит 2026-10-01, ux-14).
-- Спека: docs/work/specs/audits/2026-10-01-full-app-audit/ux-a11y.md § ux-14.
--
-- Проблема. Клієнт слав `canvas.toDataURL()` у Better Auth `updateUser({image})`,
-- а `sanitizeUserImage` навмисно обнуляє `data:` URL (інцидент 504 від
-- cookie-chunking, 2026-05-02). Аватар не зберігався за побудовою, а UI
-- казав «Аватар оновлено».
--
-- Рішення власника: тримати байти аватара в Postgres (bytea), без S3/R2/CDN.
-- `user.image` вказує на КОРОТКИЙ відносний URL `/api/avatar/<userId>?v=<epoch>`
-- (до 2 КБ, проходить `sanitizeUserImage`), а самі байти віддає
-- `GET /api/avatar/:userId`. Ліміт тіла (50 КБ) і перевірка magic bytes -
-- на застосувачі (`modules/avatar`), не CHECK-ом: перевищення має дати чистий
-- 413/415 у відповіді, а не фатальну помилку INSERT.
--
-- Один рядок на користувача: `user_id` - PK і FK на "user"(id) (Better Auth
-- opaque TEXT, не UUID) з каскадом, тож видалення акаунта прибирає аватар.
--
-- Additive, single-phase (Hard Rule #4): нова таблиця, старий код її не знає й
-- не читає, тож порядок «фронт раніше за бекенд» (AGENTS.md § Deployment) не
-- ламає нікого. `.down.sql` - лише для локального відкату.

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id       TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  content_type  TEXT NOT NULL,
  data          BYTEA NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_avatars IS
  'Аватар користувача (ux-14): байти зображення (webp/png/jpeg, до 50 КБ) для GET /api/avatar/:userId. user.image вказує на цей роут коротким URL.';
