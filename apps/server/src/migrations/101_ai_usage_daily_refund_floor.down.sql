-- Down для 101_ai_usage_daily_refund_floor.sql
--
-- Повертає строгий `> 0`. Рядки, що встигли лягти в нуль (повністю
-- зарефанджені дні), попередньо прибираємо — інакше ADD CONSTRAINT впаде на
-- валідації existing rows. Втрачається лише token-акаунтинг тих днів, де
-- жодного успішного запиту так і не було.

DELETE FROM ai_usage_daily WHERE request_count = 0;

ALTER TABLE ai_usage_daily
  DROP CONSTRAINT IF EXISTS ai_usage_daily_request_count_check;

ALTER TABLE ai_usage_daily
  ADD CONSTRAINT ai_usage_daily_request_count_check CHECK (request_count > 0);
