-- Відкат 156: прибирає колонку deleted_at з чотирьох finyk-таблиць.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).
-- Tombstone-рядки після відкату стають живими (колонку, що їх відрізняла,
-- знято) — спершу фізично видаляємо їх, щоб видалене не воскресло.

DELETE FROM finyk_tx_categories WHERE deleted_at IS NOT NULL;
DELETE FROM finyk_tx_splits WHERE deleted_at IS NOT NULL;
DELETE FROM finyk_mono_debt_links WHERE deleted_at IS NOT NULL;
DELETE FROM finyk_networth_history WHERE deleted_at IS NOT NULL;

ALTER TABLE finyk_networth_history DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE finyk_mono_debt_links DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE finyk_tx_splits DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE finyk_tx_categories DROP COLUMN IF EXISTS deleted_at;
