-- Відкат 159: знімає маркер wipe чеків Сільпо.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Після відкату наступний синк знову підтягне замовлення, стерті раніше.

ALTER TABLE silpo_connection
  DROP COLUMN IF EXISTS receipts_wiped_at;
