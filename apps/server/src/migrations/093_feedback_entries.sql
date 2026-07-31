-- Migration: feedback_entries
-- Created: 2026-07-31
--
-- In-app фідбек: власний sink для головного багрепорт-каналу закритої бети.
--
-- Чому окрема таблиця, а не «і так усе є в PostHog»: до цієї міграції сабміт
-- був fire-and-forget у `eu.i.posthog.com`, а UI показував «дякуємо» ще до
-- будь-якого підтвердження. Блокувальник реклами (домен PostHog є в типових
-- блоклистах на кшталт EasyPrivacy), Brave shields чи просто відсутня
-- мережа — і повідомлення зникало назавжди, а людина була впевнена, що
-- надіслала. Розбір: docs/03-operations/observability/feedback-loop.md § 2a.
--
-- PostHog лишається аналітичним синком (воронка opened → submitted), але
-- джерелом істини для САМОГО ТЕКСТУ тепер є ця таблиця: її не заблокує
-- розширення, і клієнт дочікується 200 перед тим, як сказати «надіслано».

CREATE TABLE feedback_entries (
  id           BIGSERIAL PRIMARY KEY,
  -- Дзеркалить FeedbackCategorySchema у packages/shared/src/schemas/api.ts.
  -- CHECK, а не pg-ENUM: додати значення в CHECK — одна ALTER-операція,
  -- тоді як зміна енум-типу тягне окрему міграцію самого типу.
  category     TEXT NOT NULL CHECK (category IN ('idea', 'bug', 'other')),
  -- Єдине поле з навмисним user-generated free-text. Верхня межа дзеркалить
  -- MAX_MESSAGE_LENGTH на клієнті; CHECK стоїть тому, що це trust boundary —
  -- клієнтський maxLength обходиться тривіально.
  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  -- Контекст сторінки: href через sanitizeUrl() (без auth-токенів) + "WxH".
  -- Обидва nullable: buildPageContext() повертає null поза DOM.
  page         TEXT,
  viewport     TEXT,
  -- Better Auth user id — непрозорий рядок, НЕ uuid. Nullable і без FK:
  -- фідбек приймаємо і від анонімів, а FK на auth-таблицю зробив би
  -- видалення акаунта (GDPR) заблокованим цим рядком.
  user_id      TEXT,
  user_agent   TEXT,
  -- 'production' | 'preview' | … — щоб шум із preview-деплоїв не змішувався
  -- з реальними репортами бети.
  app_env      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Єдина гаряча вибірка — інбокс «найновіші зверху».
CREATE INDEX feedback_entries_created_at_idx
  ON feedback_entries (created_at DESC);

-- Розбір усередині інбокса (напр. «показати лише баги»).
CREATE INDEX feedback_entries_category_created_at_idx
  ON feedback_entries (category, created_at DESC);
