-- 148: `user_preferences.push_daily_cap` — стеля нагадувань на добу.
--
-- Проблема. Звички, тренування, їжа і проактивний нудж Сержанта слали пуші
-- незалежно один від одного, без спільного бюджету частоти. Спека
-- docs/work/specs/reward-loop-and-reminders.md зводить їх в один шар, де
-- кількість пушів на київську добу обмежує стеля, яку задає сама людина.
--
-- DEFAULT 2 — рішення власника (спека, § Рішення дизайну): парасольковий
-- канон §2 «ідеальний день» називає ранок і вечір як дві точки дотику.
-- Діапазон 0-4: нуль вимикає нагадування зовсім, чотири дорівнює кількості
-- модулів. Приводи понад стелю не губляться, а згортаються в одне
-- сповіщення (`apps/server/src/lib/reminders/budget.ts`).
--
-- Лише ADD з DEFAULT, тож наявні рядки отримують 2 без бекфілу.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS push_daily_cap SMALLINT NOT NULL DEFAULT 2;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_push_daily_cap_range
  CHECK (push_daily_cap BETWEEN 0 AND 4);

COMMENT ON COLUMN user_preferences.push_daily_cap IS
  'Скільки нагадувань на київську добу може надіслати сервер. 0-4, DEFAULT 2. Приводи понад стелю згортаються в одне сповіщення.';
